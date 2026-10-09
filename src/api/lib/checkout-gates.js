/**
 * Pure guards for the EXISTING Catalyst gateway. Inputs named resolvedLines must
 * be fetched by the server for the authenticated customer, never posted by a client.
 * Amounts are integer Saudi halalas; each invoice line is rounded once.
 */
const int = (value, name, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(name + "_invalid");
  return value;
};
const safeBigInt = (value, name) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) throw new Error(name + "_invalid");
  return Number(value);
};
const moneySum = (a, b) => safeBigInt(BigInt(a) + BigInt(b), "money_overflow");
const moneyMultiply = (a, b) => safeBigInt(BigInt(a) * BigInt(b), "money_overflow");
const roundPositive = (numer, denom) => (numer + denom / 2n) / denom;
const itemIdValid = id => typeof id === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(id);

export function validateClientCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 200) throw new Error("cart_size_invalid");
  const allowed = new Set(["itemId", "selectedUnit", "quantity"]);
  const seen = new Set();
  return lines.map(line => {
    if (!line || typeof line !== "object" || Array.isArray(line) ||
        Object.keys(line).some(key => !allowed.has(key))) throw new Error("client_cart_fields_invalid");
    if (!itemIdValid(line.itemId)) throw new Error("item_id_invalid");
    if (seen.has(line.itemId)) throw new Error("duplicate_item_in_cart");
    seen.add(line.itemId); // forbid splitting one SKU across CTN/PCS to bypass stock
    if (!["CTN", "PCS"].includes(line.selectedUnit)) throw new Error("unit_invalid");
    int(line.quantity, "quantity", 1);
    if (line.quantity > 10000) throw new Error("quantity_too_large");
    return { itemId: line.itemId, selectedUnit: line.selectedUnit, quantity: line.quantity };
  });
}

/** Call after server independently resolves authoritative price, tax and stock. */
export function assertResolvedCartMatchesClient(cart, resolvedLines) {
  const safeCart = validateClientCart(cart);
  if (!Array.isArray(resolvedLines) || resolvedLines.length !== safeCart.length) {
    throw new Error("resolved_cart_mismatch");
  }
  safeCart.forEach((item, i) => {
    const row = resolvedLines[i];
    if (!row || row.itemId !== item.itemId || row.selectedUnit !== item.selectedUnit ||
        row.quantity !== item.quantity) throw new Error("resolved_cart_mismatch");
  });
  return true;
}

export function quoteResolvedCart(resolvedLines) {
  if (!Array.isArray(resolvedLines) || resolvedLines.length === 0 ||
      resolvedLines.length > 200) throw new Error("cart_size_invalid");
  let subtotalHalalas = 0, vatHalalas = 0, totalHalalas = 0;
  const seenItems = new Set(), seenBooks = new Set();
  const lines = resolvedLines.map(row => {
    if (!row || row.priceSource !== "SERVER_CREATOR_CUSTOMER_PRICE" ||
        !itemIdValid(row.itemId) || typeof row.booksItemId !== "string" ||
        !row.booksItemId.trim() || row.customerPriceVerified !== true ||
        row.booksMappingVerified !== true || row.stockFresh !== true) {
      throw new Error("source_unverified");
    }
    if (seenItems.has(row.itemId) || seenBooks.has(row.booksItemId)) {
      throw new Error("duplicate_item_in_cart");
    }
    seenItems.add(row.itemId);
    seenBooks.add(row.booksItemId);
    const qty = int(row.quantity, "quantity", 1);
    if (qty > 10000) throw new Error("quantity_too_large");
    const pack = int(row.piecesPerCarton, "conversion", 1);
    const unit = row.selectedUnit;
    if (!["CTN", "PCS"].includes(unit)) throw new Error("unit_invalid");
    int(row.stockPieces, "stock");
    const price = int(unit === "CTN" ? row.cartonPriceHalalas : row.piecePriceHalalas, "unit_price");
    const rateBps = int(row.vatRateBps, "vat_rate");
    if (rateBps > 10000 || typeof row.taxInclusive !== "boolean" ||
        row.taxMappingVerified !== true) throw new Error("tax_unverified");
    const baseQty = moneyMultiply(qty, unit === "CTN" ? pack : 1);
    if (baseQty > row.stockPieces && row.backorderApproved !== true) throw new Error("insufficient_stock");
    const gross = moneyMultiply(qty, price);
    const base = row.taxInclusive
      ? safeBigInt(roundPositive(BigInt(gross) * 10000n, BigInt(10000 + rateBps)), "money_overflow")
      : gross;
    const tax = row.taxInclusive
      ? gross - base
      : safeBigInt(roundPositive(BigInt(base) * BigInt(rateBps), 10000n), "money_overflow");
    const lineTotal = moneySum(base, tax);
    subtotalHalalas = moneySum(subtotalHalalas, base);
    vatHalalas = moneySum(vatHalalas, tax);
    totalHalalas = moneySum(totalHalalas, lineTotal);
    // Deliberately exclude base/purchase/supplier costs.
    return {
      booksItemId: row.booksItemId,
      itemId: row.itemId,
      selectedUnit: unit,
      orderedQuantity: qty,
      equivalentBaseQuantity: baseQty,
      unitPriceHalalas: price,
      subtotalHalalas: base,
      vatHalalas: tax,
      totalHalalas: lineTotal,
      vatRateBps: rateBps
    };
  });
  return { currency: "SAR", lines, subtotalHalalas, vatHalalas, totalHalalas };
}

/** Account credit fails closed. PREPAID requires independently confirmed funds. */
export function authorizePayment({
  paymentMethod, customerActive, creditMode, creditSnapshot,
  totalHalalas, paymentVerified = false
}) {
  int(totalHalalas, "total", 1);
  if (customerActive !== true) return { allowed: false, reason: "customer_inactive" };
  if (paymentMethod === "COD") return { allowed: true, reason: "cash_on_delivery" };
  if (paymentMethod === "PREPAID") return paymentVerified === true
    ? { allowed: true, reason: "prepaid_verified" }
    : { allowed: false, reason: "prepaid_not_confirmed" };
  if (paymentMethod !== "CREDIT") return { allowed: false, reason: "payment_method_invalid" };
  if (creditMode !== "ENFORCE" || !creditSnapshot ||
      creditSnapshot.trusted !== true || creditSnapshot.fresh !== true) {
    return { allowed: false, reason: "credit_not_enforceable" };
  }
  if (creditSnapshot.overridePending) return { allowed: false, reason: "approval_pending" };
  int(creditSnapshot.overdueHalalas, "overdue");
  int(creditSnapshot.availableHalalas, "available_credit");
  if (creditSnapshot.overdueHalalas > 0) return { allowed: false, reason: "overdue" };
  if (totalHalalas > creditSnapshot.availableHalalas) return { allowed: false, reason: "limit_exceeded" };
  return { allowed: true, reason: "within_credit_policy" };
}
