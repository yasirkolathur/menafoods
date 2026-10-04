/**
 * Integration seam for the EXISTING Catalyst gateway's one Zoho Books Sales Order writer.
 * Caller must first authenticate session/customer, resolve pricing/stock/tax on server,
 * check credit, and construct a Books payload with actual mapped tax and unit fields.
 * Atomic store is durable Catalyst-backed, never an in-memory Map in production.
 */
import { makeIdempotencyKey, withIdempotency } from "../lib/idempotency.js";

export async function submitPilotSalesOrder({
  store, organizationId, customerId, cartId, pilotEnabled = false,
  allowedCustomerIds, approvedQuote, booksPayload, findExisting, createBooksOrder
}) {
  if (!pilotEnabled || !(allowedCustomerIds instanceof Set) ||
      !allowedCustomerIds.has(customerId)) throw new Error("pilot_not_authorized");
  if (!organizationId || !customerId || !cartId ||
      typeof cartId !== "string" || cartId.length > 128 ||
      !approvedQuote || approvedQuote.authorized !== true ||
      !booksPayload || booksPayload.customer_id !== approvedQuote.booksCustomerId ||
      !approvedQuote.booksCustomerId) throw new Error("checkout_not_verified");
  if (typeof findExisting !== "function" || typeof createBooksOrder !== "function") {
    throw new Error("single_books_writer_required");
  }
  // The SAME immutable cart ID must be reused for double-tap, timeout and retries.
  // Only this route may POST to Books; other Creator/Commerce actions must not POST.
  const reference = "MF-" + cartId;
  const key = makeIdempotencyKey("MENAFODS", "SALESORDER",
    String(organizationId) + ":" + String(customerId) + ":" + cartId);
  return withIdempotency({
    store, key,
    handler: async () => {
      const existing = await findExisting({ reference, booksCustomerId: approvedQuote.booksCustomerId });
      if (existing) {
        if (!existing.salesorder_id || existing.customer_id !== approvedQuote.booksCustomerId ||
            existing.reference_number !== reference) throw new Error("books_order_reconciliation_mismatch");
        return { booksSalesOrderId: String(existing.salesorder_id), wasExisting: true };
      }
      // The writer must set reference_number on the exact canonical payload.
      const posted = await createBooksOrder({ ...booksPayload, reference_number: reference });
      if (!posted || !posted.salesorder_id) throw new Error("books_confirmation_missing");
      return { booksSalesOrderId: String(posted.salesorder_id), wasExisting: false };
    }
  });
}
