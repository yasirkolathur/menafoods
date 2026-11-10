import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWhatsAppSalesMessage } from '../src/api/lib/whatsapp-sales-ops.js';
import { previewVerifiedWhatsAppSalesOps } from '../src/api/routes/whatsapp-sales-ops-preview.js';

const example = 'Customer: Harabi Kebab Sulaimania\n- Jawahir Rice 40 kg - 1 bag\n- Zahrathi sunflower oil 1.5L x6 - 1 carton\n- Burcu salsa sweet chili pepper paste big 1 bottle';
function context() {
  return {
    flags: { whatsappSalesOpsEnabled: true }, user: { id: 'u1' },
    channel: 'whatsapp', proof: {
      verifiedSender: true, signatureVerified: true,
      replayChecked: true, consentConfirmed: true, linkedCustomerId: 'c1'
    }
  };
}
test('Harabi WhatsApp multiline order extracts all 3 items and quantities, not package multipliers', () => {
  const result = classifyWhatsAppSalesMessage(example);
  assert.equal(result.category, 'ORDER_REQUEST');
  assert.deepEqual(result.items.map(x => [x.quantity, x.unit]),
    [[1, 'bag'], [1, 'carton'], [1, 'bottle']]);
  assert.equal(result.items[1].requestedProduct, 'Zahrathi sunflower oil 1.5L x6');
  assert.equal(result.nextAction, 'REVIEW_SALES_ORDER');
  assert.equal(result.booksWritten, false);
});
test('price enquiry does not turn into sales order', () => {
  const result = classifyWhatsAppSalesMessage('Please send the price for Sadia chicken');
  assert.equal(result.category, 'PRICE_ENQUIRY');
  assert.equal(result.nextAction, 'REVIEW_PRICE_QUOTE');
  assert.ok(result.needs.includes('customer_specific_current_price'));
});
test('price and order mixed together need review', () => {
  assert.equal(classifyWhatsAppSalesMessage('I want to order oil, what is the price?').category,
    'ORDER_AND_PRICE_REVIEW');
});
test('stock, repeat, delivery, payment, changes, greeting are different queues', () => {
  for (const [msg, wanted] of [
    ['Is mango pulp available?', 'AVAILABILITY_ENQUIRY'],
    ['Please repeat my last order', 'REPEAT_ORDER_REVIEW'],
    ['Where is my delivery?', 'DELIVERY_ENQUIRY'],
    ['I paid the invoice', 'PAYMENT_ENQUIRY'],
    ['Please cancel order 12', 'CHANGE_OR_CANCEL_REVIEW'],
    ['السلام عليكم', 'GREETING'],
    ['The weather is good', 'GENERAL_REVIEW']
  ]) assert.equal(classifyWhatsAppSalesMessage(msg).category, wanted, msg);
});
test('sensitive OTPs are never copied to outputs', () => {
  const response = classifyWhatsAppSalesMessage('My verification code OTP 827482');
  assert.equal(response.category, 'SENSITIVE_REVIEW');
  assert.equal(response.items.length, 0);
  assert.ok(!JSON.stringify(response).includes('827482'));
});
test('reject oversized, empty and hidden-control messages', () => {
  for (const input of ['', ' '.repeat(3), 'hi\u0000there', 'a'.repeat(2001), null]) {
    assert.throws(() => classifyWhatsAppSalesMessage(input));
  }
});
test('verified adapter is read-only and has no customer-provided pricing', () => {
  const result = previewVerifiedWhatsAppSalesOps(context(), {kind: 'text', text: example});
  assert.equal(result.category, 'ORDER_REQUEST');
  assert.equal(result.customerMatch, 'server_bound');
  assert.equal(result.priceVerified, false);
  assert.equal(result.booksOrderId, null);
  assert.equal(result.orderSubmitted, false);
  assert.equal(result.replySent, false);
  assert.equal(result.requiresApproval, true);
});
test('feature is disabled by default and must be explicitly enabled', () => {
  const ctx = context(); delete ctx.flags.whatsappSalesOpsEnabled;
  assert.throws(() => previewVerifiedWhatsAppSalesOps(ctx, {kind:'text', text:example}),
    error => error.status === 503 && error.message === 'whatsapp_sales_ops_disabled');
});
test('unverified sender, signature, replay, consent and missing user fail closed', () => {
  for (const key of ['verifiedSender','signatureVerified','replayChecked','consentConfirmed','linkedCustomerId']) {
    const ctx = context();
    ctx.proof[key] = key === 'linkedCustomerId' ? '' : false;
    assert.throws(() => previewVerifiedWhatsAppSalesOps(ctx,{kind:'text',text:example}),
      error => error.status === 403 && error.message === 'whatsapp_identity_unverified');
  }
  const ctx = context(); ctx.user = null;
  assert.throws(() => previewVerifiedWhatsAppSalesOps(ctx,{kind:'text',text:example}));
});
test('incoming payload cannot set customer, price, stock, tax, confirm or Zoho writes', () => {
  for (const field of ['customerId', 'price', 'stock', 'tax', 'placeOrder', 'confirm']) {
    assert.throws(() => previewVerifiedWhatsAppSalesOps(context(), {kind:'text',text:example,[field]:true}),
      error => error.status === 400);
  }
});
test('media and unsupported events require separate verified intake', () => {
  assert.throws(() => previewVerifiedWhatsAppSalesOps(context(), {kind:'audio', text:'hi'}),
    error => error.status === 400);
});
