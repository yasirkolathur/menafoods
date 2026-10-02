import test from "node:test";
import assert from "node:assert/strict";
import { withIdempotency, makeIdempotencyKey } from "../src/api/lib/idempotency.js";

function atomicStore() {
  const pending = new Set();
  const completed = new Map();
  return {
    async claim(key) {
      if (pending.has(key) || completed.has(key)) return false;
      pending.add(key);
      return true;
    },
    async get(key) { return completed.get(key); },
    async complete(key, result) { pending.delete(key); completed.set(key, result); },
    async release(key) { pending.delete(key); }
  };
}

test("payment key is stable", () => {
  assert.equal(makeIdempotencyKey("BOOKS","PAYMENT","123"),"BOOKS:PAYMENT:123");
});

test("two concurrent deliveries execute financial handler only once", async () => {
  const store = atomicStore();
  let count = 0;
  const handler = async () => {
    count++;
    await new Promise(resolve => setImmediate(resolve));
    return { ok: true };
  };
  const results = await Promise.all([
    withIdempotency({ store, key:"BOOKS:PAYMENT:123", handler }),
    withIdempotency({ store, key:"BOOKS:PAYMENT:123", handler })
  ]);
  assert.equal(count, 1);
  assert.deepEqual(results.map(x => x.action).sort(), ["created","in_progress"]);
  const replay = await withIdempotency({ store, key:"BOOKS:PAYMENT:123", handler });
  assert.equal(replay.action,"duplicate_noop");
  assert.equal(count,1);
});

test("ambiguous handler failure retains claim until reconciliation", async () => {
  const store = atomicStore();
  await assert.rejects(withIdempotency({
    store, key:"BOOKS:PAYMENT:456",
    handler: async () => { throw new Error("temporary"); }
  }), /temporary/);
  const response = await withIdempotency({
    store, key:"BOOKS:PAYMENT:456", handler: async () => ({ ok:true })
  });
  assert.equal(response.action, "in_progress");
});

test("non-atomic adapter fails closed", async () => {
  await assert.rejects(withIdempotency({
    store: { get: async()=>null, put:async()=>{} },
    key: "BOOKS:PAYMENT:789",
    handler: async()=>({ok:true})
  }), /atomic_idempotency_store_required/);
});

test("failed completion never releases claim or reruns business handler", async () => {
  const store = atomicStore();
  let calls = 0;
  store.complete = async () => { throw new Error("completion_failure"); };
  await assert.rejects(withIdempotency({
    store, key:"BOOKS:PAYMENT:completion",
    handler: async () => { calls++; return {ok:true}; }
  }), /completion_failure/);
  const second = await withIdempotency({
    store, key:"BOOKS:PAYMENT:completion",
    handler: async () => { calls++; return {ok:true}; }
  });
  assert.equal(second.action, "in_progress");
  assert.equal(calls, 1);
});

test("explicit reconciliation may release known-safe claim for retry", async () => {
  const store = atomicStore();
  await assert.rejects(withIdempotency({
    store, key:"BOOKS:PAYMENT:reconciled",
    handler: async () => { throw new Error("ambiguous"); }
  }), /ambiguous/);
  await store.release("BOOKS:PAYMENT:reconciled"); // Only after external reconciliation
  const retry = await withIdempotency({
    store, key:"BOOKS:PAYMENT:reconciled", handler: async () => ({ok:true})
  });
  assert.equal(retry.action, "created");
});
