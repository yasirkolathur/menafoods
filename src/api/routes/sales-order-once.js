/**
 * Adapter seam for the EXISTING Catalyst gateway's only Books Sales Order POST.
 *
 * The gateway must authenticate customer/role, resolve the quote from Creator,
 * Books and Inventory, verify checkout payment and assemble the canonical Books
 * payload server-side. This code does NOT expose a standalone API or deploy it.
 * The store's claim/complete must be durable and atomic across instances.
 */
import { createHash } from "node:crypto";
import { makeIdempotencyKey, withIdempotency } from "../lib/idempotency.js";

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
function hashPayload(data) {
  return createHash("sha256").update(canonical(data)).digest("hex");
}

function normalizeServerCartItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    throw new Error("server_cart_items_invalid");
  }
  return items.map(item => {
    if (!item || typeof item.itemId !== "string" ||
        !["CTN", "PCS"].includes(item.selectedUnit) ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error("server_cart_items_invalid");
    }
    return { itemId: item.itemId, selectedUnit: item.selectedUnit, quantity: item.quantity };
  }).sort((a, b) =>
    a.itemId.localeCompare(b.itemId) ||
    a.selectedUnit.localeCompare(b.selectedUnit) ||
    a.quantity - b.quantity
  );
}

/**
 * Create the checkout identity from the authenticated server cart, not a
 * browser-generated retry key. Same server cart across device/session retries
 * converges on one token; any item/unit/quantity mutation changes the token.
 */
export function makeServerCheckoutToken({
  organizationId, customerId, serverCartId, items
}) {
  if (!organizationId || !customerId || typeof serverCartId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(serverCartId)) {
    throw new Error("server_cart_identity_invalid");
  }
  const digest = hashPayload({
    organizationId: String(organizationId),
    customerId: String(customerId),
    serverCartId,
    items: normalizeServerCartItems(items)
  });
  return "MFCK-" + digest.slice(0, 40);
}

/** Books reference is unique per org/customer/server checkout and stable on retry. */
export function makePilotBooksReference(organizationId, customerId, checkoutIdentity) {
  if (!organizationId || !customerId || typeof checkoutIdentity !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(checkoutIdentity)) {
    throw new Error("reference_parts_invalid");
  }
  const suffix = createHash("sha256")
    .update(canonical([String(organizationId), String(customerId), checkoutIdentity]))
    .digest("hex").slice(0, 12);
  return "MF-" + checkoutIdentity + "-" + suffix;
}

export async function submitPilotSalesOrder({
  store, organizationId, customerId, cartId, serverCheckoutToken,
  pilotEnabled = false, allowedCustomerIds, maxPilotOrderHalalas = 0,
  approvedQuote, booksPayload, findExisting, createBooksOrder,
  verifyPrePostPayload, verifyBooksResult
}) {
  if (pilotEnabled !== true || !(allowedCustomerIds instanceof Set) ||
      !allowedCustomerIds.has(customerId)) throw new Error("pilot_not_authorized");
  if (typeof cartId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(cartId) ||
      typeof serverCheckoutToken !== "string" ||
      !/^MFCK-[a-f0-9]{40}$/.test(serverCheckoutToken) ||
      !organizationId || !customerId || !approvedQuote ||
      approvedQuote.authorized !== true || approvedQuote.creatorCustomerId !== customerId ||
      approvedQuote.cartId !== cartId ||
      approvedQuote.serverCheckoutToken !== serverCheckoutToken ||
      !approvedQuote.booksCustomerId ||
      !Number.isSafeInteger(approvedQuote.totalHalalas) || approvedQuote.totalHalalas < 1 ||
      !Number.isSafeInteger(maxPilotOrderHalalas) || maxPilotOrderHalalas < 1 ||
      approvedQuote.totalHalalas > maxPilotOrderHalalas ||
      !booksPayload || typeof booksPayload !== "object" ||
      booksPayload.customer_id !== approvedQuote.booksCustomerId ||
      !Array.isArray(booksPayload.line_items) || booksPayload.line_items.length === 0) {
    throw new Error("checkout_not_verified");
  }
  if (typeof findExisting !== "function" || typeof createBooksOrder !== "function" ||
      typeof verifyPrePostPayload !== "function" || typeof verifyBooksResult !== "function") {
    throw new Error("single_books_writer_and_reconciliation_required");
  }

  // Stable across device/session retries for the SAME authenticated server cart.
  const reference = makePilotBooksReference(
    organizationId, customerId, serverCheckoutToken
  );
  const key = makeIdempotencyKey("MENAFOODS", "SALESORDER",
    String(organizationId) + ":" + String(customerId) + ":" + serverCheckoutToken);
  const requestHash = hashPayload({
    organizationId: String(organizationId),
    customerId, cartId, serverCheckoutToken,
    totalHalalas: approvedQuote.totalHalalas,
    booksCustomerId: approvedQuote.booksCustomerId,
    booksPayload
  });

  const result = await withIdempotency({
    store, key,
    handler: async () => {
      const existing = await findExisting({
        reference, booksCustomerId: approvedQuote.booksCustomerId
      });
      if (existing) {
        if (!existing.salesorder_id || existing.customer_id !== approvedQuote.booksCustomerId ||
            existing.reference_number !== reference) throw new Error("books_order_reconciliation_mismatch");
        // Fetch and compare actual Books lines, tax, grand total and customer,
        // not just a matching reference. Mismatch retains claim for manual review.
        const verified = await verifyBooksResult(existing, approvedQuote, booksPayload);
        if (verified !== true) throw new Error("books_order_totals_mismatch");
        return { booksSalesOrderId: String(existing.salesorder_id), wasExisting: true, requestHash };
      }
      // Re-read/reconcile authoritative customer price, mapping, unit quantity, tax,
      // stock and payment immediately before the only external Books POST. Because no
      // external write has happened yet, a failed read-only preflight can safely release
      // the claim and let the customer retry after the underlying data is corrected.
      let prePostVerified;
      try {
        prePostVerified = await verifyPrePostPayload({
          organizationId: String(organizationId),
          customerId,
          cartId,
          serverCheckoutToken,
          reference,
          requestHash,
          approvedQuote,
          booksPayload
        });
      } catch (error) {
        await store.release(key);
        throw error;
      }
      if (prePostVerified !== true) {
        await store.release(key);
        throw new Error("pre_post_verification_failed");
      }

      const posted = await createBooksOrder({ ...booksPayload, reference_number: reference });
      if (!posted || !posted.salesorder_id) throw new Error("books_confirmation_missing");
      if (posted.customer_id !== approvedQuote.booksCustomerId ||
          posted.reference_number !== reference) throw new Error("books_confirmation_mismatch");
      const verified = await verifyBooksResult(posted, approvedQuote, booksPayload);
      if (verified !== true) throw new Error("books_order_totals_mismatch");
      return { booksSalesOrderId: String(posted.salesorder_id), wasExisting: false, requestHash };
    }
  });
  if (result.action === "duplicate_noop" && result.requestHash !== requestHash) {
    throw new Error("cart_replay_payload_conflict");
  }
  return result;
}
