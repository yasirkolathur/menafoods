import test from "node:test";
import assert from "node:assert/strict";
import { booksWebhook } from "../src/api/routes/webhook-books.js";
import { inventoryWebhook } from "../src/api/routes/webhook-inventory.js";

function context(kind) {
  const claims = new Set();
  const results = new Map();
  const calls = { normalized: 0, upsert: 0, invalidate: 0 };
  const store = {
    async claim(key) { if (claims.has(key)) return false; claims.add(key); return true; },
    async get(key) { return results.get(key); },
    async complete(key, result) { results.set(key, result); },
    async release(key) { claims.delete(key); }
  };
  const normalizeEvent = async () => {
    calls.normalized++;
    return { cache_keys: ["customer:1"] };
  };
  const ctx = {
    idempotencyStore: store,
    books: { normalizeEvent },
    inventory: { normalizeEvent },
    creator: { async upsertOperationalCache() { calls.upsert++; } },
    cache: { async invalidate() { calls.invalidate++; } }
  };
  return { ctx, calls };
}

for (const [label, handler, valid] of [
  ["Books", booksWebhook, {module:"PAYMENT",payment_id:"P-1"}],
  ["Inventory", inventoryWebhook, {module:"SHIPMENT",shipment_id:"S-1"}]
]) {
  test(`${label} rejects untyped and unidentified events without side effects`, async () => {
    const {ctx, calls} = context(label);
    for (const event of [null, {}, {id:"123"}, {module:"PAYMENT"}, {module:"",id:"123"}]) {
      await assert.rejects(handler(ctx, event));
    }
    assert.deepEqual(calls, {normalized:0,upsert:0,invalidate:0});
  });

  test(`${label} performs cache write once for a duplicate record`, async () => {
    const {ctx,calls} = context(label);
    const first = await handler(ctx, valid);
    const second = await handler(ctx, valid);
    assert.equal(first.action, "created");
    assert.equal(second.action, "duplicate_noop");
    assert.deepEqual(calls, {normalized:1,upsert:1,invalidate:1});
  });
}
