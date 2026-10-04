import test from "node:test";
import assert from "node:assert/strict";
import { bootstrap } from "../src/api/routes/bootstrap.js";

function fakeContext() {
  const calls = [];
  return {
    calls,
    user: { id: "u-1" },
    auth: {
      async getProfile() { calls.push("profile"); return { id: "u-1" }; },
      async getPermissions() { calls.push("permissions"); return ["dashboard.view"]; }
    },
    cache: {
      async getDashboardSummary(id) { calls.push("summary:" + id); return { orders: 2 }; },
      async getVersions() { calls.push("versions"); return { dashboard: "v1" }; }
    }
  };
}
test("bootstrap returns shared frontend contract", async () => {
  const ctx = fakeContext();
  const result = await bootstrap(ctx);
  assert.deepEqual(result, {
    ok: true, user: { id: "u-1" }, permissions: ["dashboard.view"],
    dashboard_summary: { orders: 2 }, cache_versions: { dashboard: "v1" }
  });
  assert.equal(ctx.calls.length, 4);
});
test("bootstrap rejects unauthenticated context before invoking providers", async () => {
  await assert.rejects(bootstrap({auth: {}, cache: {}}), e =>
    e.status === 401 && e.message === "authenticated_context_required");
});
test("bootstrap rejects invalid permissions contract", async () => {
  const ctx = fakeContext();
  ctx.auth.getPermissions = async () => null;
  await assert.rejects(bootstrap(ctx), e =>
    e.status === 502 && e.message === "invalid_bootstrap_response");
});
test("bootstrap substitutes empty summaries for missing cached data", async () => {
  const ctx = fakeContext();
  ctx.cache.getDashboardSummary = async () => null;
  ctx.cache.getVersions = async () => null;
  const result = await bootstrap(ctx);
  assert.deepEqual(result.dashboard_summary, {});
  assert.deepEqual(result.cache_versions, {});
});
