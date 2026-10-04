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

/** Books reference is unique per org/customer/cart and remains stable on every retry. */
export function makePilotBooksReference(organizationId, customerId, cartId) {
  if (!organizationId || !customerId || typeof cartId !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(cartId)) throw new Error("reference_parts_invalid");
  const customerSuffix = createHash("sha256")
    .update(canonical([String(organizationId), String(customerId), cartId]))
    .digest("hex").slice(0, 12);
  return "MF-" + cartId + "-" + customerSuffix;
}

export async function submitPilotSalesOrder({
  store, organizationId, customerId, cartId, pilotEnabled = false,
  allowedCustomerIds, maxPilotOrderHalalas = 0,
  approvedQuote, booksPayload, findExisting, createBooksOrder, verifyBooksResult
}) {
  if (pilotEnabled !== true || !(allowedCustomerIds instanceof Set) ||
      !allowedCustomerIds.has(customerId)) throw new Error("pilot_not_authorized");
  if (typeof cartId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(cartId) ||
      !organizationId || !customerId || !approvedQuote ||
      approvedQuote.authorized !== true || approvedQuote.creatorCustomerId !== customerId ||
      approvedQuote.cartId !== cartId || !approvedQuote.booksCustomerId ||
      !Number.isSafeInteger(approvedQuote.totalHalalas) || approvedQuote.totalHalalas < 1 ||
      !Number.isSafeInteger(maxPilotOrderHalalas) || maxPilotOrderHalalas < 1 ||
      approvedQuote.totalHalalas > maxPilotOrderHalalas ||
      !booksPayload || typeof booksPayload !== "object" ||
      booksPayload.customer_id !== approvedQuote.booksCustomerId ||
      !Array.isArray(booksPayload.line_items) || booksPayload.line_items.length === 0) {
    throw new Error("checkout_not_verified");
  }
  if (typeof findExisting !== "function" || typeof createBooksOrder !== "function" ||
      typeof verifyBooksResult !== "function") {
    throw new Error("single_books_writer_and_reconciliation_required");
  }

  // Stable reference across retries; the gateway must prevent a second writer.
  const reference = makePilotBooksReference(organizationId, customerId, cartId);
  const key = makeIdempotencyKey("MENAFOODS", "SALESORDER",
    String(organizationId) + ":" + String(customerId) + ":" + cartId);
  const requestHash = hashPayload({
    organizationId: String(organizationId),
    customerId, cartId,
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
