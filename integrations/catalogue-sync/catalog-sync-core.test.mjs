import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { assertProductEvent, verifiedWebhook, normalizeIdentity,
 serializePublicProduct, ingestProductEvent } from "./catalog-sync-core.mjs";
const base = { type: "catalog.product.upsert", tenantId: "menafoods",
  eventId: "books:item:change-101", origin: "books", ids: { books: "123" },
  expectedRevision: 0, fields: { name_en: "Rice 40 kg", catalog_rate: 255 } };
test("requires exact IDs, rejects name-only matching", () => {
  assert.throws(() => normalizeIdentity({}), /exact source product ID/);
  assert.deepEqual(normalizeIdentity({ books: " 123 " }), { books: "123" });
});
test("checks webhook HMAC in constant time", () => {
  const body = '{"event":"product"}'; const secret = "test-secret";
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifiedWebhook(body, "sha256=" + sig, secret), true);
  assert.equal(verifiedWebhook(body + "x", sig, secret), false);
});
test("blocks unapproved cost updates and admin impersonation", () => {
  assert.throws(() => assertProductEvent({ ...base, fields: { purchase_cost: 5 } }), /Bills are authoritative/);
  assert.throws(() => assertProductEvent({ ...base, origin: "catalyst", ids: { catalyst: "1" } }), /admin/);
});
test("public serializer never exposes costs, supplier, profit or unapproved images", () => {
  const p = { publicId: "1", revision: 2, fields: {
    published: true, catalog_rate: 25, purchase_cost: 20, margin: 5,
    supplier_id: "private", name_en: "Item", images: [
      { url: "https://img.example/good.jpg", status: "approved", usage_rights_confirmed: true },
      { url: "https://img.example/bad.jpg", status: "pending" }]
  }};
  const result = serializePublicProduct(p);
  assert.equal(result.images.length, 1);
  assert.equal(result.purchase_cost, undefined);
  assert.equal(result.supplier_id, undefined);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(serializePublicProduct({ ...p, fields: { ...p.fields, published: false } }), null);
});
test("atomic outbox queues native-aware destinations only once", async () => {
  const seen = new Set(), jobs = [];
  let current;
  const store = { transaction: async fn => fn({
    seenEvent: async key => seen.has(key),
    findByExactIds: async () => current,
    upsertProduct: async record => { current = { ...record, publicId: "stable-1" }; return current; },
    enqueueOutbox: async row => jobs.push(row),
    markEventSeen: async key => seen.add(key)
  }) };
  const opts = { store, authenticate: async () => undefined, nativeFinanceSyncVerified: true };
  assert.equal((await ingestProductEvent(base, opts)).result, "queued");
  assert.equal((await ingestProductEvent(base, opts)).result, "already_processed");
  assert.deepEqual(jobs.map(j => j.destination), ["creator", "catalyst"]);
  assert.equal(current.revision, 1);
  await assert.rejects(() => ingestProductEvent({ ...base, eventId: "change-102" }, opts), /Revision conflict/);
  await assert.rejects(() => ingestProductEvent({ ...base, eventId: "change-103",
    expectedRevision: 1, ids: { books: "changed" } }, opts), /collision/);
});

test("native finance sync must be verified before enqueuing mutations", async () => {
  await assert.rejects(
    () => ingestProductEvent(base, { authenticate: async () => {}, store: { transaction: async () => {} } }),
    /Finance native synchronization/
  );
});
