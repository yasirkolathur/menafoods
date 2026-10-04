import test from "node:test";
import assert from "node:assert/strict";
import { validateClientCart, quoteResolvedCart, authorizePayment } from "../src/api/lib/checkout-gates.js";
import { submitPilotSalesOrder } from "../src/api/routes/sales-order-once.js";

const row = (overrides = {}) => ({
  itemId: "lar-chicken-breast", booksItemId: "BOOKS-123",
  priceSource: "SERVER_CREATOR_CUSTOMER_PRICE",
  customerPriceVerified: true, booksMappingVerified: true, stockFresh: true,
  quantity: 5, selectedUnit: "CTN", piecesPerCarton: 4,
  cartonPriceHalalas: 19800, piecePriceHalalas: 5500,
  stockPieces: 20, backorderApproved: false,
  vatRateBps: 1500, taxInclusive: false, taxMappingVerified: true,
  ...overrides
});

function store() {
  const pending = new Set(), completed = new Map();
  return {
    async claim(k) { if (pending.has(k) || completed.has(k)) return false; pending.add(k); return true; },
    async get(k) { return completed.get(k); },
    async complete(k, data) { pending.delete(k); completed.set(k, data); },
    async release(k) { pending.delete(k); }
  };
}

const orderArgs = (overrides = {}) => ({
  store: store(), organizationId: "844477749", customerId: "pilot-1", cartId: "cart-immutable-1",
  pilotEnabled: true, allowedCustomerIds: new Set(["pilot-1"]),
  approvedQuote: { authorized: true, booksCustomerId: "books-customer-1" },
  booksPayload: { customer_id: "books-customer-1", line_items: [{ item_id: "BOOKS-123" }] },
  findExisting: async () => null,
  createBooksOrder: async () => ({ salesorder_id: "SO-1" }),
  ...overrides
});

test("client can submit only item, CTN/PCS and quantity; no pricing/cost/customer overrides", () => {
  assert.deepEqual(validateClientCart([{ itemId: "a", selectedUnit: "PCS", quantity: 2 }]),
    [{ itemId: "a", selectedUnit: "PCS", quantity: 2 }]);
  for (const field of ["unit_price", "purchase_price", "customerId", "tax", "stock", "price"]) {
    assert.throws(() => validateClientCart([{ itemId: "a", selectedUnit: "CTN", quantity: 1, [field]: 1 }]),
      /client_cart_fields_invalid/);
  }
  assert.throws(() => validateClientCart([{ itemId: "a", selectedUnit: "PCS", quantity: 1.5 }]),
    /quantity_invalid/);
});

test("198 SAR x 5 CTN = 990 + 15% VAT = 1138.50 SAR, equivalent 20 PCS", () => {
  const quote = quoteResolvedCart([row()]);
  assert.equal(quote.subtotalHalalas, 99000);
  assert.equal(quote.vatHalalas, 14850);
  assert.equal(quote.totalHalalas, 113850);
  assert.equal(quote.lines[0].equivalentBaseQuantity, 20);
  assert.equal(quote.lines[0].selectedUnit, "CTN");
  assert.equal(Object.keys(quote.lines[0]).some(k => /cost|purchase/i.test(k)), false);
});

test("PCS selection uses piece price and product-specific mapping; supports zero-rated VAT", () => {
  const quote = quoteResolvedCart([row({
    quantity: 2, selectedUnit: "PCS", stockPieces: 2, vatRateBps: 0
  })]);
  assert.equal(quote.totalHalalas, 11000);
  assert.equal(quote.vatHalalas, 0);
  assert.equal(quote.lines[0].equivalentBaseQuantity, 2);
});

test("tax-inclusive price is not taxed twice", () => {
  const q = quoteResolvedCart([row({ quantity: 1, cartonPriceHalalas: 11500, taxInclusive: true })]);
  assert.equal(q.subtotalHalalas, 10000);
  assert.equal(q.vatHalalas, 1500);
  assert.equal(q.totalHalalas, 11500);
});

test("zero stock is respected; backorder requires explicit approval", () => {
  assert.throws(() => quoteResolvedCart([row({ stockPieces: 0 })]), /insufficient_stock/);
  assert.equal(quoteResolvedCart([row({ stockPieces: 0, backorderApproved: true })]).lines.length, 1);
});

test("unmapped, stale, client-priced or unverified tax lines fail closed", () => {
  for (const patch of [
    { priceSource: "CUSTOMER" }, { customerPriceVerified: false },
    { booksMappingVerified: false }, { stockFresh: false },
    { taxMappingVerified: false }, { vatRateBps: undefined },
    { booksItemId: "" }, { piecesPerCarton: 0 }
  ]) assert.throws(() => quoteResolvedCart([row(patch)]));
});

test("OBSERVE, stale credit, pending approval, overdue and credit-limit breach block credit", () => {
  const creditSnapshot = { trusted: true, fresh: true, overdueHalalas: 0,
    availableHalalas: 150000, overridePending: false };
  const props = { customerActive: true, paymentMethod: "CREDIT",
    creditMode: "ENFORCE", totalHalalas: 113850, creditSnapshot };
  assert.equal(authorizePayment(props).allowed, true);
  assert.equal(authorizePayment({ ...props, creditMode: "OBSERVE" }).allowed, false);
  assert.equal(authorizePayment({ ...props, creditSnapshot: { ...creditSnapshot, fresh: false } }).allowed, false);
  assert.equal(authorizePayment({ ...props, creditSnapshot: { ...creditSnapshot, overdueHalalas: 1 } }).allowed, false);
  assert.equal(authorizePayment({ ...props, creditSnapshot: { ...creditSnapshot, availableHalalas: 110000 } }).allowed, false);
  assert.equal(authorizePayment({ ...props, creditSnapshot: { ...creditSnapshot, overridePending: true } }).allowed, false);
  assert.equal(authorizePayment({ ...props, paymentMethod: "COD" }).allowed, true);
});

test("pilot is allowlisted and disabled by default", async () => {
  await assert.rejects(submitPilotSalesOrder(orderArgs({ pilotEnabled: false })), /pilot_not_authorized/);
  await assert.rejects(submitPilotSalesOrder(orderArgs({ allowedCustomerIds: new Set() })), /pilot_not_authorized/);
  await assert.rejects(submitPilotSalesOrder(orderArgs({ approvedQuote: { authorized: false } })), /checkout_not_verified/);
});

test("double-tap and post-completion replay create exactly one Books Sales Order", async () => {
  let writes = 0;
  const args = orderArgs({ createBooksOrder: async () => {
    writes++;
    await new Promise(resolve => setImmediate(resolve));
    return { salesorder_id: "SO-1" };
  } });
  const first = await Promise.all([submitPilotSalesOrder(args), submitPilotSalesOrder(args)]);
  assert.deepEqual(first.map(x => x.action).sort(), ["created", "in_progress"]);
  const replay = await submitPilotSalesOrder(args);
  assert.equal(replay.action, "duplicate_noop");
  assert.equal(writes, 1);
});

test("failed Books response retains durable claim: no second post without reconciliation", async () => {
  let writes = 0;
  const args = orderArgs({ createBooksOrder: async () => {
    writes++;
    throw new Error("unknown_after_network_timeout");
  } });
  await assert.rejects(submitPilotSalesOrder(args), /unknown_after_network_timeout/);
  assert.equal((await submitPilotSalesOrder(args)).action, "in_progress");
  assert.equal(writes, 1);
});

test("reconciles only same Books customer and reference, otherwise blocks", async () => {
  const args = orderArgs({ findExisting: async ({ reference, booksCustomerId }) => ({
    salesorder_id: "SO-EXISTING", customer_id: booksCustomerId, reference_number: reference
  }), createBooksOrder: async () => { throw new Error("must_not_post"); } });
  const result = await submitPilotSalesOrder(args);
  assert.equal(result.booksSalesOrderId, "SO-EXISTING");
  assert.equal(result.wasExisting, true);
  await assert.rejects(submitPilotSalesOrder(orderArgs({
    findExisting: async () => ({ salesorder_id: "SO-OTHER",
      customer_id: "wrong-customer", reference_number: "MF-cart-immutable-1" })
  })), /reconciliation_mismatch/);
});

test("non-atomic store is rejected even when pilot is enabled", async () => {
  await assert.rejects(submitPilotSalesOrder(orderArgs({ store: {
    get: async () => null, put: async () => null
  } })), /atomic_idempotency_store_required/);
});
