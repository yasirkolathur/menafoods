/**
 * Shared, server-only arithmetic guard for the existing Catalyst checkout.
 * NEVER construct resolvedLines from client-provided prices, tax, stock or Books mappings.
 * The gateway must resolve each line for the authenticated customer's Creator price tier.
 * Monetary amounts are integer halalas (SAR * 100); no floats for totals.
 */
const integer = (value, name, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(name + "_invalid");
  return value;
};
const sumSafe = (a, b) => integer(a + b, "money_overflow");
const multiplySafe = (a, b) => integer(a * b, "money_overflow");

export function validateClientCart(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("cart_empty");
  const allowed = new Set(["itemId", "selectedUnit", "quantity"]);
  return lines.map(line => {
    if (!line || typeof line !== "object" || Array.isArray(line) ||
        Object.keys(line).some(key => !allowed.has(key))) throw new Error("client_cart_fields_invalid");
    if (typeof line.itemId !== "string" || !line.itemId.trim()) throw new Error("item_id_invalid");
    if (!["CTN", "PCS"].includes(line.selectedUnit)) throw new Error("unit_invalid");
    integer(line.quantity, "quantity", 1);
    return { itemId: line.itemId, selectedUnit: line.selectedUnit, quantity: line.quantity };
  });
}

export function quoteResolvedCart(resolvedLines) {
  if (!Array.isArray(resolvedLines) || !resolvedLines.length) throw new Error("cart_empty");
  let subtotalHalalas = 0, vatHalalas = 0, totalHalalas = 0;
  const lines = resolvedLines.map(row => {
    if (!row || row.priceSource !== "SERVER_CREATOR_CUSTOMER_PRICE" ||
        !row.booksItemId || !row.customerPriceVerified ||
        !row.booksMappingVerified || !row.stockFresh) throw new Error("source_unverified");
    const qty = integer(row.quantity, "quantity", 1);
    const pack = integer(row.piecesPerCarton, "conversion", 1);
    const unit = row.selectedUnit;
    if (!["CTN", "PCS"].includes(unit)) throw new Error("unit_invalid");
    integer(row.stockPieces, "stock");
    const price = integer(
      unit === "CTN" ? row.cartonPriceHalalas : row.piecePriceHalalas,
      "unit_price"
    );
    const rateBps = integer(row.vatRateBps, "vat_rate");
    if (rateBps > 10000 || typeof row.taxInclusive !== "boolean" ||
        !row.taxMappingVerified) throw new Error("tax_unverified");
    const baseQty = multiplySafe(qty, unit === "CTN" ? pack : 1);
    if (baseQty > row.stockPieces && row.backorderApproved !== true) throw new Error("insufficient_stock");
    const gross = multiplySafe(qty, price);
    const base = row.taxInclusive ? Math.round(gross * 10000 / (10000 + rateBps)) : gross;
    const tax = row.taxInclusive ? gross - base : Math.round(base * rateBps / 10000);
    integer(base, "money_overflow");
    integer(tax, "money_overflow");
    subtotalHalalas = sumSafe(subtotalHalalas, base);
    vatHalalas = sumSafe(vatHalalas, tax);
    totalHalalas = sumSafe(totalHalalas, base + tax);
    // No procurement costs or purchase-price fields are ever returned.
    return {
      booksItemId: String(row.booksItemId),
      itemId: String(row.itemId),
      selectedUnit: unit,
      orderedQuantity: qty,
      equivalentBaseQuantity: baseQty,
      unitPriceHalalas: price,
      subtotalHalalas: base,
      vatHalalas: tax,
      totalHalalas: base + tax,
      vatRateBps: rateBps
    };
  });
  return { currency: "SAR", lines, subtotalHalalas, vatHalalas, totalHalalas };
}

/** No credit order may proceed with OBSERVE, stale finance data or pending approval. */
export function authorizePayment({ paymentMethod, customerActive, creditMode, creditSnapshot, totalHalalas }) {
  integer(totalHalalas, "total", 1);
  if (!customerActive) return { allowed: false, reason: "customer_inactive" };
  if (paymentMethod === "COD" || paymentMethod === "PREPAID") return { allowed: true, reason: "non_credit" };
  if (paymentMethod !== "CREDIT") return { allowed: false, reason: "payment_method_invalid" };
  if (creditMode !== "ENFORCE" || !creditSnapshot ||
      creditSnapshot.trusted !== true || creditSnapshot.fresh !== true) {
    return { allowed: false, reason: "credit_not_enforceable" };
  }
  if (creditSnapshot.overridePending) return { allowed: false, reason: "approval_pending" };
  integer(creditSnapshot.overdueHalalas, "overdue");
  integer(creditSnapshot.availableHalalas, "available_credit");
  if (creditSnapshot.overdueHalalas > 0) return { allowed: false, reason: "overdue" };
  if (totalHalalas > creditSnapshot.availableHalalas) return { allowed: false, reason: "limit_exceeded" };
  return { allowed: true, reason: "within_credit_policy" };
}
