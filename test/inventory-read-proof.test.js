import test from "node:test";
import assert from "node:assert/strict";
import { assertInventoryReadResponse, verifiedInventoryWarehouseStock } from "../src/api/lib/inventory-read-proof.js";

const item = stock => ({ code: 0, item: {
  item_id: "books-item-1", status: "active", track_inventory: true,
  purchase_rate: 9999, vendor_id: "PRIVATE",
  stock_on_hand: 99999, // aggregate is never used as location availability
  locations: [{ location_id: "warehouse-1", location_available_stock: stock }]
} });
const warehouses = { code: 0, warehouses: [{ warehouse_id: "warehouse-1", status: "active" }] };
const args = (override = {}) => ({
  itemResponse: item("24.00"), warehousesResponse: warehouses,
  expectedItemId: "books-item-1", warehouseId: "warehouse-1",
  fetchedAtMs: 100000, nowMs: 100050, ...override
});

test("fresh authenticated Inventory reads prove exact warehouse stock, without supplier costs", () => {
  const proof = verifiedInventoryWarehouseStock(args());
  assert.equal(proof.stockPieces, 24);
  assert.equal(proof.stockFresh, true);
  assert.equal(proof.warehouseId, "warehouse-1");
  assert.equal(Object.keys(proof).some(k => /cost|purchase|vendor|rate|token/i.test(k)), false);
  assert.equal(proof.source, "ZOHO_INVENTORY_SERVER_READ");
});

test("zero is real stock, while missing/fractional/negative stock must fail closed", () => {
  assert.equal(verifiedInventoryWarehouseStock(args({ itemResponse: item(0) })).stockPieces, 0);
  for (const invalid of ["", null, undefined, -1, 0.5, "2.5", "NaN"]) {
    assert.throws(() => verifiedInventoryWarehouseStock(args({
      itemResponse: item(invalid)
    })), /warehouse_stock_unverified/);
  }
});

test("401, 403 and Inventory code 57 fail closed without leaking response", () => {
  for (const status of [401, 403]) {
    assert.throws(() => assertInventoryReadResponse({ code: 0 }, status),
      /inventory_read_unauthorized_or_scope_missing/);
  }
  assert.throws(() => assertInventoryReadResponse({ code: 57, message: "secret-value" }),
    /inventory_read_unauthorized_or_scope_missing/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({
    warehousesResponse: { code: 57 }
  })), /inventory_read_unauthorized_or_scope_missing/);
  assert.throws(() => assertInventoryReadResponse({ code: 2500 }),
    /inventory_read_unavailable/);
});

test("forbid staleness, wrong item and wrong or inactive warehouse", () => {
  assert.throws(() => verifiedInventoryWarehouseStock(args({ nowMs: 160000 })),
    /inventory_snapshot_stale_or_invalid/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({ nowMs: 99999 })),
    /inventory_snapshot_stale_or_invalid/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({ expectedItemId: "different" })),
    /inventory_item_unverified/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({ warehouseId: "other" })),
    /warehouse_not_verified/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({
    warehousesResponse: { code: 0, warehouses: [{ warehouse_id: "warehouse-1", status: "inactive" }] }
  })), /warehouse_not_verified/);
});

test("reject untracked items and duplicate or absent location stock rows", () => {
  assert.throws(() => verifiedInventoryWarehouseStock(args({
    itemResponse: { code: 0, item: { ...item(10).item, track_inventory: false } }
  })), /inventory_item_unverified/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({
    itemResponse: { code: 0, item: { ...item(10).item, locations: [] } }
  })), /warehouse_stock_unverified/);
  assert.throws(() => verifiedInventoryWarehouseStock(args({
    itemResponse: { code: 0, item: { ...item(10).item,
      locations: [item(10).item.locations[0], item(11).item.locations[0]]
    } }
  })), /warehouse_stock_unverified/);
});


test("explicitly inactive item locations cannot authorize checkout stock", () => {
  for (const marker of [{ status: "inactive" }, { is_active: false }]) {
    const stockRow = { location_id: "warehouse-1", location_available_stock: "99.00", ...marker };
    assert.throws(() => verifiedInventoryWarehouseStock(args({
      itemResponse: { code: 0, item: { ...item(99).item, locations: [stockRow] } }
    })), /warehouse_stock_unverified/);
  }
});
