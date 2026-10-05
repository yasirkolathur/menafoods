import test from "node:test";
import assert from "node:assert/strict";
import { CATALYST_PROJECT, assertCatalystProject } from "../src/api/lib/project-lock.js";

test("real MENAFoods Catalyst project is accepted", () => {
  assert.equal(assertCatalystProject({
    projectId:"17990000000237407",
    projectName:"menafoodscustomermiddleware",
    environment:"Development"
  }).id, CATALYST_PROJECT.id);
});

test("Polls demo project is rejected", () => {
  assert.throws(() => assertCatalystProject({
    projectId:"17990000000006001",
    projectName:"Polls",
    environment:"Development"
  }), /catalyst_project_mismatch/);
});

test("production deployment is rejected by Core P0 integration guard", () => {
  assert.throws(() => assertCatalystProject({
    projectId:"17990000000237407",
    projectName:"menafoodscustomermiddleware",
    environment:"Production"
  }), /development_environment_required/);
});
