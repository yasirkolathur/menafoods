import test from "node:test";
import assert from "node:assert/strict";
import { withIdempotency } from "../../src/api/lib/idempotency.js";

test("atomic claims prevent concurrent duplicate payment processing", async () => {
  const claimed = new Set();
  const completed = new Map();
  let calls = 0;
  const store = {
    async claim(key) {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async get(key) { return completed.get(key); },
    async complete(key, value) { completed.set(key, value); },
    async release(key) { claimed.delete(key); }
  };
  const handler = async () => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    return { ok: true };
  };
  const [first, second] = await Promise.all([
    withIdempotency({ store, key: "BOOKS:PAYMENT:456", handler }),
    withIdempotency({ store, key: "BOOKS:PAYMENT:456", handler })
  ]);
  assert.equal(calls, 1);
  assert.deepEqual([first.action, second.action].sort(), ["created", "duplicate_noop"]);
});

test("failed handler releases claimed key for subsequent retries", async () => {
  const claimed = new Set();
  const store = {
    async claim(key) { if (claimed.has(key)) return false; claimed.add(key); return true; },
    async get() { return null; },
    async complete() {},
    async release(key) { claimed.delete(key); }
  };
  await assert.rejects(
    withIdempotency({ store, key: "BOOKS:PAYMENT:789", handler: async () => { throw new Error("temporary_failure"); } }),
    /temporary_failure/
  );
  const later = await withIdempotency({
    store, key: "BOOKS:PAYMENT:789", handler: async () => ({ ok: true })
  });
  assert.equal(later.action, "created");
});
