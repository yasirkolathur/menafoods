import test from "node:test";
import assert from "node:assert/strict";
import {
  extractIntentHints, scopedProducts, scopedOrders
} from "../src/api/lib/assistant-policy.js";
import { assistantHelp } from "../src/api/routes/assistant-help.js";

function ctx(patch = {}) {
  return {
    user: { id: "user-a" }, channel: "web",
    flags: { assistantEnabled: true, modelEnabled: false },
    auth: { async getAssistantScope() {
      return { principalId: "user-a", customerId: "cust-a",
        role: "customer", active: true, permissions: ["assistant.use"] };
    } },
    rateLimiter: { async consume() { return { allowed: true }; } },
    catalog: { async searchForCustomer() {
      return [{ customerId: "cust-a", itemId: "SKU1", displayName: "Fries" }];
    } },
    orders: { async listRecentForCustomer() {
      return [{ customerId: "cust-a", orderNumber: "SO-1", status: "pending" }];
    } },
    ...patch
  };
}
async function expectDenied(op, code, status) {
  await assert.rejects(op, err => err.status === status && err.message === code);
}

test("assistant disabled by default, before scope or provider calls", async () => {
  let reads = 0;
  const c = ctx({ flags: undefined });
  c.auth.getAssistantScope = async () => { reads++; throw Error("should never run"); };
  await expectDenied(assistantHelp(c, { text: "find rice" }), "assistant_disabled", 503);
  assert.equal(reads, 0);
});
test("explicit disable overrides otherwise valid customer scope", async () => {
  await expectDenied(assistantHelp(ctx({ flags: { assistantEnabled: false } }),
    { text: "track order" }), "assistant_disabled", 503);
});
test("full untrusted user message and personally identifying text never sent to optional model", async () => {
  let supplied;
  const c = ctx({
    flags: { assistantEnabled: true, modelEnabled: true },
    model: { async classifyIntent(input) { supplied = input; return "order_status"; } }
  });
  const text = "delivery today for Mary 0551234567 at 15 Hill St. secret Token";
  const result = await assistantHelp(c, { text });
  assert.equal(result.intent, "order_status");
  assert.equal(supplied.text, "delivery");
  assert.equal(supplied.maxOutputTokens, 24);
  assert.ok(!JSON.stringify(supplied).includes("Mary"));
  assert.ok(!JSON.stringify(supplied).includes("0551234567"));
  assert.ok(!JSON.stringify(supplied).includes("Hill"));
});
test("unknown message with no intent hint never uses model", async () => {
  let attempts = 0;
  const c = ctx({
    flags: { assistantEnabled: true, modelEnabled: true },
    model: { async classifyIntent() { attempts++; return "product_search"; } }
  });
  const result = await assistantHelp(c, { text: "customer Jane 0551234567" });
  assert.equal(result.intent, "support");
  assert.equal(attempts, 0);
});
test("model stays disabled when only assistant feature is on", async () => {
  let attempts = 0;
  const c = ctx({ model: { async classifyIntent() { attempts++; return "reorder"; } } });
  const result = await assistantHelp(c, { text: "delivery" });
  assert.equal(result.intent, "support");
  assert.equal(attempts, 0);
});
test("Arabic intent hints preserve only allowlisted intent words", () => {
  assert.equal(extractIntentHints("توصيل طلبي إلى حي العزيزية 0551234567"),
    "توصيل");
  assert.equal(extractIntentHints("payment card 1234 5678 9012 3456"), "");
});
test("provider rows beyond requested limit are rejected, never silently truncated", () => {
  const row = { customerId: "A", itemId: "X", displayName: "Mango" };
  assert.throws(() => scopedProducts([...Array(5).fill(row),
    { ...row, customerId: "B" }], "A"), /assistant_catalog_scope_invalid/);
  const order = { customerId: "A", orderNumber: "SO-1", status: "processing" };
  assert.throws(() => scopedOrders([...Array(3).fill(order),
    { ...order, customerId: "B" }], "A"), /assistant_orders_scope_invalid/);
});
test("explicit branch context rejects cross-outlet catalog and order records", async () => {
  const c = ctx();
  c.auth.getAssistantScope = async () => ({
    principalId: "user-a", customerId: "cust-a", branchId: "outlet-1",
    branchScoped: true, role: "customer", active: true, permissions: ["assistant.use"]
  });
  c.catalog.searchForCustomer = async args => {
    assert.equal(args.branchId, "outlet-1");
    return [{ customerId: "cust-a", branchId: "outlet-2",
      itemId: "SKU1", displayName: "Private" }];
  };
  await expectDenied(assistantHelp(c, { text: "find rice" }),
    "assistant_catalog_scope_invalid", 502);
  c.orders.listRecentForCustomer = async args => {
    assert.equal(args.branchId, "outlet-1");
    return [{ customerId: "cust-a", branchId: "outlet-2",
      orderNumber: "SO-1", status: "pending" }];
  };
  await expectDenied(assistantHelp(c, { text: "track order" }),
    "assistant_orders_scope_invalid", 502);
});
test("mandatory outlet context missing denies before catalog reads", async () => {
  let catalogReads = 0;
  const c = ctx();
  c.auth.getAssistantScope = async () => ({
    principalId: "user-a", customerId: "cust-a", branchScoped: true,
    role: "customer", active: true, permissions: ["assistant.use"]
  });
  c.catalog.searchForCustomer = async () => { catalogReads++; return []; };
  await expectDenied(assistantHelp(c, { text: "find milk" }), "assistant_forbidden", 403);
  assert.equal(catalogReads, 0);
});
test("WhatsApp missing signature, replay check or consent each denies", async () => {
  const proof = {
    verifiedSender: true, signatureVerified: true, replayChecked: true,
    consentConfirmed: true, linkedCustomerId: "cust-a"
  };
  for (const prop of ["signatureVerified", "replayChecked", "consentConfirmed"]) {
    await expectDenied(assistantHelp(ctx({
      channel: "whatsapp", proof: { ...proof, [prop]: false }
    }), { text: "find milk" }), "whatsapp_identity_unverified", 403);
  }
  assert.equal((await assistantHelp(ctx({ channel: "whatsapp", proof }),
    { text: "find milk" })).order_submitted, false);
});
test("limiter outage and malformed response fail with generic 503", async () => {
  for (const consume of [
    async () => { throw Error("INTERNAL DATABASE API KEY SECRET"); },
    async () => null, async () => ({}), async () => ({ allowed: "true" })
  ]) {
    await expectDenied(assistantHelp(ctx({ rateLimiter: { consume } }),
      { text: "find apples" }), "assistant_limits_unavailable", 503);
  }
});
test("catalog and order backend errors never surface raw provider secrets", async () => {
  const c = ctx({ catalog: { async searchForCustomer() {
    throw Error("Bearer INTERNAL_PROVIDER_TOKEN");
  } } });
  await expectDenied(assistantHelp(c, { text: "find apples" }),
    "assistant_catalog_unavailable", 503);
  c.orders.listRecentForCustomer = async () => {
    throw Error("INTERNAL_BOOKS_SENSITIVE");
  };
  await expectDenied(assistantHelp(c, { text: "track order" }),
    "assistant_orders_unavailable", 503);
});
