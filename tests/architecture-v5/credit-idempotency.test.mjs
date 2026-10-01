import test from "node:test";
import assert from "node:assert/strict";
import { decideCredit } from "../../src/api/routes/credit-decision.js";
import { makeIdempotencyKey, withIdempotency } from "../../src/api/lib/idempotency.js";

test("OBSERVE overdue proposes hold but does not enforce", () => {
  assert.deepEqual(
    decideCredit({ dataTrusted: true, overdue: 100, mode: "OBSERVE" }),
    { decision: "OBSERVE", proposed_decision: "CREDIT_HOLD", enforce: false, reason: "overdue" }
  );
});

test("ENFORCE overdue creates credit hold", () => {
  assert.deepEqual(
    decideCredit({ dataTrusted: true, overdue: 100, mode: "ENFORCE" }),
    { decision: "CREDIT_HOLD", proposed_decision: null, enforce: true, reason: "overdue" }
  );
});

test("approved override allows order", () => {
  assert.deepEqual(
    decideCredit({ dataTrusted: true, overdue: 100, overrideStatus: "APPROVED", mode: "ENFORCE" }),
    { decision: "ALLOW", proposed_decision: null, enforce: false, reason: "override_approved" }
  );
});

test("stable idempotency key", () => {
  assert.equal(makeIdempotencyKey("BOOKS", "PAYMENT", "123"), "BOOKS:PAYMENT:123");
});

test("duplicate fallback event executes handler once", async () => {
  const data = new Map();
  const store = {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); }
  };

  let calls = 0;
  const handler = async () => {
    calls += 1;
    return { ok: true };
  };

  const first = await withIdempotency({ store, key: "BOOKS:PAYMENT:123", handler });
  const second = await withIdempotency({ store, key: "BOOKS:PAYMENT:123", handler });

  assert.equal(first.action, "created");
  assert.equal(second.action, "duplicate_noop");
  assert.equal(calls, 1);
});
