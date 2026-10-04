import test from "node:test";
import assert from "node:assert/strict";
import { decideCredit } from "../src/api/routes/credit-decision.js";
import { makeIdempotencyKey, withIdempotency } from "../src/api/lib/idempotency.js";
import { shouldLiveVerifyExposure } from "../src/api/lib/cache-policy.js";

test("credit defaults to OBSERVE when data is untrusted", () => {
  assert.deepEqual(decideCredit({ dataTrusted: false, orderTotal: 100 }), {
    decision: "OBSERVE",
    enforce: false,
    reason: "data_untrusted"
  });
});

test("credit hold enforces only in ENFORCE mode", () => {
  assert.equal(decideCredit({ dataTrusted: true, overdue: 50, mode: "OBSERVE" }).enforce, false);
  assert.equal(decideCredit({ dataTrusted: true, overdue: 50, mode: "ENFORCE" }).enforce, true);
});

test("idempotency key is deterministic", () => {
  assert.equal(makeIdempotencyKey("BOOKS", "invoice", "123"), "BOOKS:invoice:123");
});

test("idempotency replays without calling handler twice", async () => {
  const data = new Map();
  const claimed = new Set();
  const store = {
    async claim(key) {
      if (claimed.has(key) || data.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async get(key) { return data.get(key); },
    async complete(key, value) {
      data.set(key, value);
      claimed.delete(key);
    },
    async release(key) { claimed.delete(key); }
  };
  let calls = 0;
  const handler = async () => ({ ok: true, calls: ++calls });

  const first = await withIdempotency({ store, key: "k", handler });
  const second = await withIdempotency({ store, key: "k", handler });

  assert.equal(first.action, "created");
  assert.equal(second.action, "duplicate_noop");
  assert.equal(calls, 1);
});

test("exposure verification triggers for stale or risky state", () => {
  assert.equal(shouldLiveVerifyExposure({ ageSeconds: 301, nearLimit: false, largeOrder: false }), true);
  assert.equal(shouldLiveVerifyExposure({ ageSeconds: 1, nearLimit: true, largeOrder: false }), true);
  assert.equal(shouldLiveVerifyExposure({ ageSeconds: 1, nearLimit: false, largeOrder: false }), false);
});
