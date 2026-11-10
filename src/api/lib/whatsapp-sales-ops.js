/**
 * Deterministic, low-cost WhatsApp sales triage. This module does not send
 * messages, look up tenant data, quote a price or write to Zoho Books.
 * Only the existing verified Catalyst gateway may call the server-side adapter.
 */
const UNIT = '(?:cartons?|ctns?|boxes?|bags?|bottles?|tins?|packs?|pkts?|pieces?|pcs|kg|كرتون|كرتونة|كراتين|كيس|اكياس|أكياس|علبة|علب|حبة|حبات|باكت|كرتن)';
const QUANTITY_SUFFIX = new RegExp('(?:\\s*[-–—:]\\s*|\\s+)([1-9]\\d{0,3}(?:\\.\\d{1,2})?)\\s*('+UNIT+')\\s*\\.?$', 'iu');
const ORDER = /\b(order|purchase|buy|need|want|restock|sales[ -]?order)\b|(?:اريد|أريد|ابغى|أبغى|احتاج|أحتاج|اطلب|طلبية|طلب جديد)/iu;
const REORDER = /\b(reorder|repeat (?:my |the )?(?:last |previous )?order|same as (?:last|before))\b|(?:نفس الطلب|اعد الطلب|أعد الطلب|كرر الطلب)/iu;
const PRICE = /\b(prices?|rates?|quotation|quotations|quoting|cost|how much)\b|(?:سعر|اسعار|أسعار|بكم|كم السعر|التسعير)/iu;
const STOCK = /\b(stock|available|availability|in store)\b|(?:متوفر|متوفرة|موجود|موجودة|المخزون)/iu;
const DELIVERY = /\b(deliver(?:y|ed)?|dispatch|tracking|track|where is my order|shipment)\b|(?:توصيل|التوصيل|التسليم|وين طلبي|شحن|الشحن)/iu;
const PAYMENT = /\b(payment|paid|balance|receipt|collection|credit|invoice)\b|(?:فاتورة|دفع|سداد|تحصيل|رصيد|مدفوع)/iu;
const CHANGE = /\b(cancel|cancellation|modify|change|replace|remove|return)\b|(?:الغي|إلغاء|الغاء|تعديل|استبدال|ارجاع|إرجاع)/iu;
const SENSITIVE = /\b(otp|password|passcode|verification code|one.time password|secret key|api key)\b|(?:رمز التحقق|كلمة المرور)/iu;
const GREETING = /^(hi|hello|hey|salam|assalamu alaikum|good morning|good evening|السلام عليكم|مرحبا|اهلا|أهلا|صباح الخير)[\s!.،]*$/iu;

function parseItems(text) {
  const items = [];
  for (const line of text.split(/\r?\n/u).slice(0, 40)) {
    let part = line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/u, '').trim();
    if (!part || /^(?:customer|restaurant|from|date|عميل|المطعم)\s*:/iu.test(part)) continue;
    const match = part.match(QUANTITY_SUFFIX);
    if (!match) continue;
    const product = part.slice(0, match.index).trim().replace(/[-–—:,\s]+$/u, '');
    if (product.length < 3 || product.length > 180) continue;
    items.push({ requestedProduct: product, quantity: Number(match[1]), unit: match[2] });
    if (items.length === 25) break;
  }
  return items;
}

/**
 * Classify message text. Customer identity and external-price verification are
 * deliberately out of scope; no AI/model call is needed for common requests.
 */
export function classifyWhatsAppSalesMessage(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    throw new TypeError('whatsapp_text_invalid');
  }
  const value = text.normalize('NFKC').trim();
  if (!value) throw new TypeError('whatsapp_text_invalid');
  const items = parseItems(value);
  const flags = {
    sensitive: SENSITIVE.test(value), change: CHANGE.test(value),
    reorder: REORDER.test(value), price: PRICE.test(value),
    stock: STOCK.test(value), delivery: DELIVERY.test(value),
    payment: PAYMENT.test(value), order: ORDER.test(value) || items.length > 0
  };
  let category = 'GENERAL_REVIEW';
  if (flags.sensitive) category = 'SENSITIVE_REVIEW';
  else if (flags.change) category = 'CHANGE_OR_CANCEL_REVIEW';
  else if (flags.reorder) category = 'REPEAT_ORDER_REVIEW';
  else if (flags.price && flags.order) category = 'ORDER_AND_PRICE_REVIEW';
  else if (flags.order) category = 'ORDER_REQUEST';
  else if (flags.price) category = 'PRICE_ENQUIRY';
  else if (flags.stock) category = 'AVAILABILITY_ENQUIRY';
  else if (flags.delivery) category = 'DELIVERY_ENQUIRY';
  else if (flags.payment) category = 'PAYMENT_ENQUIRY';
  else if (GREETING.test(value)) category = 'GREETING';

  const nextAction = ({
    ORDER_REQUEST: 'REVIEW_SALES_ORDER',
    ORDER_AND_PRICE_REVIEW: 'REVIEW_SALES_ORDER_AND_PRICE',
    PRICE_ENQUIRY: 'REVIEW_PRICE_QUOTE',
    AVAILABILITY_ENQUIRY: 'REVIEW_STOCK',
    REPEAT_ORDER_REVIEW: 'REVIEW_REPEAT_ORDER',
    CHANGE_OR_CANCEL_REVIEW: 'REVIEW_ORDER_CHANGE',
    DELIVERY_ENQUIRY: 'REVIEW_DELIVERY',
    PAYMENT_ENQUIRY: 'REVIEW_ACCOUNTS',
    SENSITIVE_REVIEW: 'HUMAN_REVIEW',
    GREETING: 'NO_ORDER_ACTION',
    GENERAL_REVIEW: 'HUMAN_REVIEW'
  })[category];
  const needs = ['manual_approval'];
  if (['ORDER_REQUEST', 'ORDER_AND_PRICE_REVIEW', 'REPEAT_ORDER_REVIEW'].includes(category)) {
    needs.push('verified_customer', 'exact_catalog_match', 'carton_piece_conversion',
      'customer_specific_current_price', 'tax_stock_check', 'books_duplicate_check');
  } else if (category === 'PRICE_ENQUIRY') {
    needs.push('verified_customer', 'exact_catalog_match', 'customer_specific_current_price', 'tax_check');
  } else if (category === 'AVAILABILITY_ENQUIRY') {
    needs.push('verified_customer', 'exact_catalog_match', 'live_stock_check');
  }
  if (category === 'ORDER_REQUEST' && items.length === 0) needs.push('human_item_extraction');
  if (category === 'SENSITIVE_REVIEW') return {
    category, nextAction, items: [], needs, requiresApproval: true,
    booksWritten: false, whatsappReplySent: false
  };
  return {
    category, nextAction, items, needs, requiresApproval: true,
    booksWritten: false, whatsappReplySent: false
  };
}
