import test from "node:test";
import assert from "node:assert/strict";
import { MenaApi, MenaApiError } from "../../src/frontend/shared/api-client.js";

test("bootstrap uses the shared gateway and sends session token", async () => {
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (url, options) => {
    called += 1;
    assert.equal(url, "/mf-api/bootstrap");
    assert.equal(options.headers.Authorization, "Bearer test-session");
    return new Response(JSON.stringify({ ok: true, permissions: [] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const api = new MenaApi({ tokenProvider: async () => "test-session" });
    assert.deepEqual(await api.bootstrap(), { ok: true, permissions: [] });
    assert.equal(called, 1);
  } finally { globalThis.fetch = original; }
});

test("API failures carry structured HTTP information", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({code:"not_authorized"}), {
    status:403, headers:{"content-type":"application/json"}
  });
  try {
    await assert.rejects(new MenaApi().bootstrap(), e =>
      e instanceof MenaApiError && e.status === 403 && e.code === "not_authorized"
    );
  } finally { globalThis.fetch = original; }
});

test("customer identifiers are URL encoded", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, "/mf-api/finops/customers/C%2F42/exposure");
    return new Response("{}", { status:200, headers:{"content-type":"application/json"} });
  };
  try { await new MenaApi().exposure("C/42"); }
  finally { globalThis.fetch = original; }
});
