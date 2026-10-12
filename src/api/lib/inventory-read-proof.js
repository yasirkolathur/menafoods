/**
 * Read-only Zoho Inventory proof for the existing Catalyst mf_zoho_gateway.
 * NEVER call Inventory directly from a browser or expose the underlying item:
 * it may contain supplier costs. Both responses MUST be fetched server-side
 * with an existing, authorized OAuth connection and a verified organization.
 * This helper performs no requests or financial/data mutations.
 */
function deny(message) { throw new Error(message); }

export function assertInventoryReadResponse(response, httpStatus = 200) {
  if (httpStatus === 401 || httpStatus === 403 || String(response?.code) === "57") {
    deny("inventory_read_unauthorized_or_scope_missing");
  }
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300 ||
      !response || response.code !== 0) {
    deny("inventory_read_unavailable");
  }
  return true;
}

function safeStockInteger(value) {
  // Zoho can return numeric strings such as "12.00". Empty values are unknown,
  // NOT zero. Do not round fractional kg or use aggregate stock as a substitute.
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^(0|[1-9][0-9]*)(?:\\.0+)?$/.test(text)) {
    deny("warehouse_stock_unverified");
  }
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 0) deny("warehouse_stock_unverified");
  return quantity;
}

export function verifiedInventoryWarehouseStock({
  itemResponse, itemHttpStatus = 200, warehousesResponse, warehousesHttpStatus = 200,
  expectedItemId, warehouseId, fetchedAtMs, nowMs, maxAgeMs = 30000
}) {
  assertInventoryReadResponse(itemResponse, itemHttpStatus);
  assertInventoryReadResponse(warehousesResponse, warehousesHttpStatus);
  if (!expectedItemId || !warehouseId ||
      !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(fetchedAtMs) ||
      !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 ||
      fetchedAtMs > nowMs || nowMs - fetchedAtMs > maxAgeMs) {
    deny("inventory_snapshot_stale_or_invalid");
  }
  const warehouses = warehousesResponse.warehouses;
  if (!Array.isArray(warehouses) ||
      warehouses.filter(w => String(w?.warehouse_id) === String(warehouseId) &&
        w.status === "active").length !== 1) {
    deny("warehouse_not_verified");
  }
  const item = itemResponse.item;
  if (!item || String(item.item_id) !== String(expectedItemId) ||
      item.status !== "active" || item.track_inventory !== true) {
    deny("inventory_item_unverified");
  }
  const locations = Array.isArray(item.locations) ? item.locations : item.warehouses;
  if (!Array.isArray(locations)) deny("warehouse_stock_unverified");
  const match = locations.filter(l =>
    String(l?.location_id ?? l?.warehouse_id) === String(warehouseId));
  if (match.length !== 1) deny("warehouse_stock_unverified");
  const stock = match[0];
  const qty = Object.hasOwn(stock, "location_available_stock")
    ? stock.location_available_stock
    : stock.warehouse_available_stock;
  const stockPieces = safeStockInteger(qty);
  // Explicitly exclude prices, cost, purchase_rate, token and supplier data.
  return Object.freeze({
    itemId: String(expectedItemId),
    warehouseId: String(warehouseId),
    stockPieces,
    stockFresh: true,
    source: "ZOHO_INVENTORY_SERVER_READ",
    fetchedAtMs
  });
}
