import { assistantError, parseAssistantRequest } from "../lib/assistant-policy.js";
import { assistantHelp } from "./assistant-help.js";

/**
 * Call ONLY behind the existing verified WhatsApp webhook gateway. No webhook
 * endpoint, WhatsApp provider connection, voice transcription or Zoho writer
 * is introduced by this adapter.
 *
 * The gateway must use server-side, verified binding and replay protection.
 * For voice the gateway must store a correlation/confirmation state in its
 * existing protected datastore and assert transcriptConfirmedServerSide.
 */
export async function intakeVerifiedWhatsApp(ctx, inbound) {
  if (ctx?.flags?.assistantEnabled !== true) {
    throw assistantError("assistant_disabled", 503);
  }
  if (!ctx?.user?.id || ctx.channel !== "whatsapp" ||
      ctx.proof?.verifiedSender !== true ||
      ctx.proof?.signatureVerified !== true ||
      ctx.proof?.replayChecked !== true ||
      ctx.proof?.consentConfirmed !== true ||
      typeof ctx.proof?.linkedCustomerId !== "string") {
    throw assistantError("whatsapp_identity_unverified", 403);
  }
  if (!inbound || typeof inbound !== "object" || Array.isArray(inbound) ||
      Object.keys(inbound).some(key => !["kind", "text", "locale"].includes(key))) {
    throw assistantError("whatsapp_intake_invalid", 400);
  }
  if (!["text", "voice_transcript"].includes(inbound.kind)) {
    throw assistantError("whatsapp_intake_invalid", 400);
  }
  const parsed = parseAssistantRequest({ text: inbound.text, locale: inbound.locale });
  if (inbound.kind === "voice_transcript" &&
      ctx.proof.transcriptConfirmedServerSide !== true) {
    // No classifier, catalog/Zoho lookup or order action before transcript
    // confirmation by the same verified sender.
    return {
      ok: true, locale: parsed.locale,
      requires_transcript_confirmation: true,
      order_submitted: false,
      suggested_action: { kind: "REVIEW_TRANSCRIPT", requires_confirmation: true }
    };
  }
  return assistantHelp(ctx, parsed);
}
