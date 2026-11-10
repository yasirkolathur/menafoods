import { assistantError } from '../lib/assistant-policy.js';
import { classifyWhatsAppSalesMessage } from '../lib/whatsapp-sales-ops.js';

/**
 * Source-only adapter for the EXISTING Catalyst WhatsApp gateway.
 * MUST sit after provider signature validation, sender/customer binding and
 * durable message-ID replay check. Feature defaults OFF. No new endpoint.
 * Does NOT send WhatsApp replies, fetch or post data, or persist a second order.
 */
export function previewVerifiedWhatsAppSalesOps(ctx, inbound) {
  if (ctx?.flags?.whatsappSalesOpsEnabled !== true) {
    throw assistantError('whatsapp_sales_ops_disabled', 503);
  }
  if (!ctx?.user?.id || ctx.channel !== 'whatsapp' ||
      ctx.proof?.verifiedSender !== true ||
      ctx.proof?.signatureVerified !== true ||
      ctx.proof?.replayChecked !== true ||
      ctx.proof?.consentConfirmed !== true ||
      typeof ctx.proof?.linkedCustomerId !== 'string' ||
      !ctx.proof.linkedCustomerId.trim()) {
    throw assistantError('whatsapp_identity_unverified', 403);
  }
  if (!inbound || typeof inbound !== 'object' || Array.isArray(inbound) ||
      Object.keys(inbound).some(key => !['kind', 'text'].includes(key)) ||
      inbound.kind !== 'text') {
    throw assistantError('whatsapp_sales_input_invalid', 400);
  }
  let review;
  try {
    review = classifyWhatsAppSalesMessage(inbound.text);
  } catch {
    throw assistantError('whatsapp_sales_input_invalid', 400);
  }
  return {
    ok: true, ...review, source: 'verified_whatsapp',
    customerMatch: 'server_bound',
    priceVerified: false, booksOrderId: null,
    orderSubmitted: false, replySent: false
  };
}
