import test from "node:test";
import assert from "node:assert/strict";

const DEFAULT_BASE = "https://menafoodscustomermiddleware-809407193.development.catalystserverless.com";
const base = (process.env.MF_CATALYST_DEV_BASE || DEFAULT_BASE).replace(/\/$/, "");

async function read(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(base + path, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "error"
    });
  } finally { clearTimeout(timer); }
}

test("existing Catalyst gateway responds without changing state", async () => {
  const res = await read("/mf-api/health");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.service, "mf_zoho_gateway");
});

test("live Commerce connection is reported ready by gateway", async () => {
  const res = await read("/mf-api/mobile/status");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data_source, "ZOHO_COMMERCE_LIVE");
  assert.equal(json.sample_data_used, false);
});

test("live Commerce categories are available", async () => {
  const res = await read("/mf-api/mobile/catalog/categories");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data_source, "ZOHO_COMMERCE_LIVE");
  assert.ok(Array.isArray(json.result?.categories));
  assert.ok(json.result.categories.length > 0);
});

test("live Commerce products are available; zero stock may be valid", async () => {
  const res = await read("/mf-api/mobile/catalog/products?page=1&per_page=1");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data_source, "ZOHO_COMMERCE_LIVE");
  assert.ok(Array.isArray(json.result?.products));
  assert.ok(json.result.products.length > 0);
  assert.ok(json.result.products.every(p => Number.isFinite(Number(p.overall_stock))));
});

for (const path of [
  "/mf-api/auth/session",
  "/mf-api/admin/product-unit-rules",
  "/mf-api/admin/product-unit-sync/logs"
]) {
  test(`unauthenticated ${path} denies access`, async () => {
    const res = await read(path);
    assert.equal(res.status, 401);
  });
}
