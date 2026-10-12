import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAssistantRequest, redactForClassifier, detectIntent,
  acceptedModelIntent, scopedProducts, scopedOrders
} from "../src/api/lib/assistant-policy.js";
import { assistantHelp } from "../src/api/routes/assistant-help.js";

function fakeCtx(overrides = {}) {
  const calls = [];
  const ctx = {
    calls,
    user: { id: "session-A" },
    channel: "web",
    auth: {
      async getAssistantScope() {
        calls.push("scope");
        return {
          principalId: "session-A", customerId: "customer-A",
          role: "customer", active: true, permissions: ["assistant.use"]
        };
      }
    },
    rateLimiter: {
      async consume(args) { calls.push(["limit", args]); return { allowed: true }; }
    },
    catalog: {
      async searchForCustomer(args) {
        calls.push(["catalog", args]);
        return [{
          customerId: "customer-A", itemId: "FRIES-01",
          displayName: "Frozen fries", sku: "FR-01",
          purchaseCostHalalas: 100, cartonPriceHalalas: 9999,
          supplierName: "PRIVATE SUPPLIER"
        }];
      }
    },
    orders: {
      async listRecentForCustomer(args) {
        calls.push(["orders", args]);
        return [{ customerId: "customer-A", orderNumber: "SO-123", status: "processing", total: 300 }];
      }
    },
    telemetry: {
      async record(args) { calls.push(["metric", args]); }
    }
  };
  return Object.assign(ctx, overrides);
}
async function denied(promise, code, status) {
  await assert.rejects(promise, err => err.message === code && err.status === status);
}

test("input accepts only text and locale; rejects financial/tenant overrides", () => {
  assert.deepEqual(parseAssistantRequest({ text: " بطاطس ", locale: "ar" }), { text: "بطاطس", locale: "ar" });
  for (const bad of [
    { text: "fries", price: 1 }, { text: "fries", customerId: "B" },
    { text: "fries", confirm: true }, { text: "fries", role: "admin" },
    { text: "fries", locale: "xx" }, { text: "" },
    { text: "x".repeat(501) }, { text: "hi\u0000" }, ["hello"]
  ]) assert.throws(() => parseAssistantRequest(bad));
});
test("EN/AR intents resolve locally without a model", () => {
  assert.equal(detectIntent("search chicken"), "product_search");
  assert.equal(detectIntent("أبحث عن بطاطس"), "product_search");
  assert.equal(detectIntent("buy again"), "reorder");
  assert.equal(detectIntent("إعادة طلب"), "reorder");
  assert.equal(detectIntent("track my order"), "order_status");
  assert.equal(detectIntent("تتبع الطلب"), "order_status");
  assert.equal(detectIntent("complaint"), "support");
  assert.equal(detectIntent("شكوى"), "support");
});
test("redaction removes common tokens before a cheap classifier", () => {
  const redacted = redactForClassifier("mail foo@example.com mobile +966 55 123 4567 token Bearer abcdef");
  assert.ok(!redacted.includes("foo@example.com"));
  assert.ok(!redacted.includes("123 4567"));
  assert.ok(!redacted.includes("Bearer abcdef"));
});
test("untrusted model cannot invent an order or a price action", () => {
  assert.equal(acceptedModelIntent({ intent: "POST_SALES_ORDER", price: 0 }), "unknown");
  assert.equal(acceptedModelIntent({ intent: "reorder" }), "reorder");
});
test("scoped data allows only a strict public customer-safe response", () => {
  const products = scopedProducts([{
    customerId: "A", itemId: "X", displayName: "Basmati", purchaseCost: 44, tax: 15
  }], "A");
  assert.deepEqual(products, [{ itemId: "X", name: "Basmati" }]);
  assert.throws(() => scopedProducts([{ customerId: "B", itemId: "X", displayName: "Private" }], "A"));
  assert.throws(() => scopedOrders([{ customerId: "B", orderNumber: "SO-2", status: "pending" }], "A"));
});
test("catalog query is customer-scoped, omits costs/prices and never posts", async () => {
  const ctx = fakeCtx();
  const result = await assistantHelp(ctx, { text: "search fries" });
  assert.equal(result.intent, "product_search");
  assert.equal(result.order_submitted, false);
  assert.deepEqual(result.products, [{ itemId: "FRIES-01", name: "Frozen fries", sku: "FR-01" }]);
  assert.equal(result.suggested_action.kind, "OPEN_CATALOG");
  assert.equal(result.suggested_action.requires_confirmation, true);
  assert.deepEqual(ctx.calls.find(c => Array.isArray(c) && c[0] === "catalog")[1],
    { customerId: "customer-A", query: "search fries", limit: 5 });
  assert.ok(!JSON.stringify(result).includes("PRIVATE SUPPLIER"));
  assert.ok(!JSON.stringify(result).includes("9999"));
});
test("Arabic reorder presents only human-confirmed Buy Again, without using historical prices", async () => {
  const ctx = fakeCtx();
  const result = await assistantHelp(ctx, { text: "إعادة طلب", locale: "ar" });
  assert.equal(result.intent, "reorder");
  assert.equal(result.suggested_action.kind, "OPEN_BUY_AGAIN");
  assert.match(result.answer, /اطلب مجدداً/u);
  assert.equal(ctx.calls.some(c => Array.isArray(c) && ["catalog", "orders"].includes(c[0])), false);
});
test("status is read-only and tenant-scoped", async () => {
  const ctx = fakeCtx();
  const result = await assistantHelp(ctx, { text: "track my order" });
  assert.deepEqual(result.orders, [{ orderNumber: "SO-123", status: "processing" }]);
  assert.deepEqual(ctx.calls.find(c => Array.isArray(c) && c[0] === "orders")[1],
    { customerId: "customer-A", limit: 3 });
});
test("missing login blocks provider access", async () => {
  const ctx = fakeCtx({ user: null });
  await denied(assistantHelp(ctx, { text: "search fries" }), "authenticated_context_required", 401);
  assert.equal(ctx.calls.length, 0);
});
test("role, active, permission, and principal mismatch each deny service", async () => {
  for (const patch of [
    { role: "seller" }, { role: "accountant" }, { role: "storekeeper" },
    { role: "salesperson" }, { active: false },
    { permissions: [] }, { principalId: "session-B" }
  ]) {
    const ctx = fakeCtx();
    ctx.auth.getAssistantScope = async () => ({
      principalId: "session-A", customerId: "customer-A", role: "customer",
      active: true, permissions: ["assistant.use"], ...patch
    });
    await denied(assistantHelp(ctx, { text: "search rice" }), "assistant_forbidden", 403);
    assert.equal(ctx.calls.some(c => Array.isArray(c) && c[0] === "catalog"), false);
  }
});
test("WhatsApp requires an already-verified channel and customer identity", async () => {
  const ctx = fakeCtx({ channel: "whatsapp" });
  await denied(assistantHelp(ctx, { text: "find rice" }), "whatsapp_identity_unverified", 403);
  ctx.proof = { verifiedSender: true, linkedCustomerId: "customer-B" };
  await denied(assistantHelp(ctx, { text: "find rice" }), "whatsapp_identity_unverified", 403);
  ctx.proof.linkedCustomerId = "customer-A";
  const result = await assistantHelp(ctx, { text: "find rice" });
  assert.equal(result.intent, "product_search");
});
test("unknown channel and missing durable limiter fail closed", async () => {
  await denied(assistantHelp(fakeCtx({ channel: "injected" }), { text: "search" }),
    "assistant_channel_unverified", 403);
  await denied(assistantHelp(fakeCtx({ rateLimiter: null }), { text: "search" }),
    "assistant_limits_unavailable", 503);
});
test("rate limiting prevents catalog reads", async () => {
  const ctx = fakeCtx();
  ctx.rateLimiter.consume = async () => ({ allowed: false });
  await denied(assistantHelp(ctx, { text: "find milk" }), "assistant_rate_limited", 429);
  assert.equal(ctx.calls.some(c => Array.isArray(c) && c[0] === "catalog"), false);
});
test("cross-customer catalog and order results fail closed with no leaked response", async () => {
  const ctx = fakeCtx();
  ctx.catalog.searchForCustomer = async () => [{ customerId: "B", itemId: "X", displayName: "Secret" }];
  await denied(assistantHelp(ctx, { text: "search" }), "assistant_catalog_scope_invalid", 502);
  ctx.orders.listRecentForCustomer = async () => [{ customerId: "B", orderNumber: "SO-3", status: "pending" }];
  await denied(assistantHelp(ctx, { text: "order status" }), "assistant_orders_scope_invalid", 502);
});
test("cheap optional classifier sees redacted text, has no power over actions", async () => {
  const ctx = fakeCtx();
  let request;
  ctx.model = { async classifyIntent(options) { request = options; return { intent: "reorder", price: 1 }; } };
  const result = await assistantHelp(ctx, { text: "foo@example.com" });
  assert.equal(result.intent, "reorder");
  assert.ok(!request.text.includes("foo@example.com"));
  assert.equal(request.maxOutputTokens, 24);
  assert.equal(result.order_submitted, false);
});
test("classifier error falls back to support without retrying or leaking errors", async () => {
  const ctx = fakeCtx();
  let attempts = 0;
  ctx.model = { async classifyIntent() { attempts++; throw new Error("SECRET INTERNAL"); } };
  const result = await assistantHelp(ctx, { text: "hi" });
  assert.equal(attempts, 1);
  assert.equal(result.intent, "support");
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});
test("telemetry contains intent counts only and never raw text", async () => {
  const ctx = fakeCtx();
  await assistantHelp(ctx, { text: "search foo@example.com" });
  const event = ctx.calls.find(c => Array.isArray(c) && c[0] === "metric")[1];
  assert.equal(event.event, "assistant_intent");
  assert.ok(!JSON.stringify(event).includes("foo@example.com"));
});
