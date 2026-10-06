import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync(new URL("../config/catalyst-runtime-contract.json", import.meta.url), "utf8"));

test("Catalyst runtime contract allows exactly one advanced I/O backend target", () => {
  const ids = new Set(Object.values(cfg.allowed_advancedio_routes));
  assert.equal(ids.size, 1);
  assert.equal([...ids][0], cfg.backend.function_id);
});

test("runtime policy forbids creating a duplicate backend or order writer", () => {
  assert.equal(cfg.policy.single_routable_backend, true);
  assert.equal(cfg.policy.create_new_backend, false);
  assert.equal(cfg.policy.duplicate_order_writer, false);
  assert.equal(cfg.policy.replit_active, false);
  assert.equal(cfg.policy.credit_mode, "OBSERVE");
});
