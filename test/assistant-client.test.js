import test from "node:test";
import assert from "node:assert/strict";
import { MenaApi } from "../src/frontend/shared/api-client.js";

test("shared PWA/Android API client sends only text/locale to protected Catalyst route", async () => {
  const previous = globalThis.fetch;
  let invoked = false;
  globalThis.fetch = async (url, init) => {
    invoked = true;
    assert.equal(url, "/mf-api/assistant");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer session-test");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), { text: "أبحث عن زيت", locale: "ar" });
    return { ok: true, async json() { return { ok: true, order_submitted: false }; } };
  };
  try {
    const api = new MenaApi({ tokenProvider: async () => "session-test" });
    const result = await api.assistant("أبحث عن زيت", "ar");
    assert.equal(invoked, true);
    assert.equal(result.order_submitted, false);
  } finally {
    globalThis.fetch = previous;
  }
});
test("shared API client surfaces auth/server errors, does not silently retry", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 403 }; };
  try {
    const api = new MenaApi({ tokenProvider: async () => null });
    await assert.rejects(api.assistant("find milk"), /api_error_403/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
