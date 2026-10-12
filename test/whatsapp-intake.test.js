import test from "node:test";
import assert from "node:assert/strict";
import { intakeVerifiedWhatsApp } from "../src/api/routes/whatsapp-assistant-intake.js";

function context(patch = {}) {
  const calls = [];
  const ctx = {
    calls, channel: "whatsapp", user: { id: "u1" },
    flags: { assistantEnabled: true, modelEnabled: false },
    proof: {
      verifiedSender: true, signatureVerified: true, replayChecked: true,
      consentConfirmed: true, linkedCustomerId: "c1",
      transcriptConfirmedServerSide: false
    },
    auth: { async getAssistantScope() {
      calls.push("scope");
      return { principalId: "u1", customerId: "c1",
        role: "customer", active: true, permissions: ["assistant.use"] };
    } },
    rateLimiter: { async consume() { calls.push("limit"); return { allowed: true }; } },
    catalog: { async searchForCustomer() { calls.push("catalog"); return []; } },
    orders: { async listRecentForCustomer() { calls.push("orders"); return []; } }
  };
  return Object.assign(ctx, patch);
}
const voice = { kind: "voice_transcript", text: "أبحث عن بطاطس", locale: "ar" };
test("verified voice stops at human transcript review, no backend reads", async () => {
  const ctx = context();
  const result = await intakeVerifiedWhatsApp(ctx, voice);
  assert.equal(result.requires_transcript_confirmation, true);
  assert.equal(result.order_submitted, false);
  assert.equal(result.suggested_action.kind, "REVIEW_TRANSCRIPT");
  assert.deepEqual(ctx.calls, []);
});
test("server-confirmed voice passes into existing read-only assistant path", async () => {
  const ctx = context();
  ctx.proof.transcriptConfirmedServerSide = true;
  const result = await intakeVerifiedWhatsApp(ctx, voice);
  assert.equal(result.order_submitted, false);
  assert.equal(result.intent, "product_search");
  assert.deepEqual(ctx.calls.slice(0, 3), ["scope", "limit", "catalog"]);
});
test("verified WhatsApp text uses same route with human cart confirmation", async () => {
  const result = await intakeVerifiedWhatsApp(context(), {
    kind: "text", text: "buy again", locale: "en"
  });
  assert.equal(result.intent, "reorder");
  assert.equal(result.suggested_action.kind, "OPEN_BUY_AGAIN");
  assert.equal(result.suggested_action.requires_confirmation, true);
  assert.equal(result.order_submitted, false);
});
test("unverified signature, replay, sender or consent each fail closed", async () => {
  for(const property of ["signatureVerified","replayChecked","verifiedSender","consentConfirmed"]) {
    const ctx = context();
    ctx.proof[property] = false;
    await assert.rejects(intakeVerifiedWhatsApp(ctx, voice), e =>
      e.status === 403 && e.message === "whatsapp_identity_unverified");
    assert.deepEqual(ctx.calls, []);
  }
});
test("inbound payload cannot forge confirmation, user, tax, price, stock or order action", async () => {
  for(const bad of [
    {...voice, transcriptConfirmedServerSide: true},
    {...voice, price: 0},
    {...voice, customerId:"another"},
    {...voice, placeOrder: true},
    {...voice, taxRate: 0},
    {...voice, stock: 999999}
  ]) {
    await assert.rejects(intakeVerifiedWhatsApp(context(), bad),
      e => e.status === 400 && e.message === "whatsapp_intake_invalid");
  }
});
test("reject raw media or untranscribed audio instead of processing it", async () => {
  await assert.rejects(intakeVerifiedWhatsApp(context(), {
    kind: "audio", text: "hi"
  }), e => e.status === 400 && e.message === "whatsapp_intake_invalid");
});
test("an incorrect authenticated customer binding is rejected by the common handler", async () => {
  const ctx = context();
  ctx.proof.linkedCustomerId = "other-customer";
  await assert.rejects(intakeVerifiedWhatsApp(ctx, {
    kind: "text", text: "find milk"
  }), e => e.status === 403 && e.message === "whatsapp_identity_unverified");
});
