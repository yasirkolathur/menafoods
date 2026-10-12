// Source-independent guardrails for the EXISTING Catalyst /mf-api adapter.
// No model output may become a price, order, authorization, or action.
export const ALLOWED_INTENTS = Object.freeze(["product_search", "reorder", "order_status", "support"]);

export function assistantError(code, status = 400) {
  const error = new Error(code);
  error.status = status;
  return error;
}

export function parseAssistantRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["text", "locale"].includes(key))) {
    throw assistantError("assistant_fields_invalid");
  }
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body.text)) {
    throw assistantError("assistant_text_invalid");
  }
  const locale = body.locale ?? "en";
  if (!["en", "ar"].includes(locale)) throw assistantError("assistant_locale_invalid");
  return { text: body.text.trim(), locale };
}

export function redactForClassifier(text) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted]")
    .replace(/(?:\+?\d[\s().-]*){9,}/gu, "[redacted]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|Bearer\s+\S+)\b/giu, "[redacted]")
    .slice(0, 500);
}

/**
 * Data-minimized hint extraction. The optional classifier receives ONLY these
 * preapproved words, never free-form customer text, PII, names or Zoho data.
 * Unknown inputs without hints take a deterministic support fallback.
 */
const MODEL_HINTS = new Set([
  "delivery", "purchase", "buy", "again", "repeat", "order",
  "status", "where", "help", "item", "list", "available", "question",
  "توصيل", "شراء", "طلب", "تتبع", "مساعدة", "استفسار", "منتج", "متابعة",
  "اعادة", "إعادة", "مره", "مرة", "عايز", "ابغى", "أبغى"
]);
export function extractIntentHints(text) {
  if (typeof text !== "string") return "";
  const tokens = text.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(tokens.filter(token => MODEL_HINTS.has(token)))].slice(0, 8).join(" ");
}

export function detectIntent(text) {
  const value = text.toLocaleLowerCase("en").normalize("NFKC");
  if (/\b(reorder|buy again|repeat (my |the )?order)\b/u.test(value) ||
      /إعادة\s*طلب|اعادة\s*طلب|كرر\s*الطلب|نفس\s*الطلب|اطلب\s*مجدد/u.test(value)) return "reorder";
  if (/\b(track|order status|where is my order)\b/u.test(value) ||
      /حالة\s*الطلب|تتبع\s*الطلب|وين\s*الطلب|أين\s*طلبي/u.test(value)) return "order_status";
  if (/\b(help|support|complaint|refund|problem)\b/u.test(value) ||
      /مساعدة|شكوى|الدعم|مشكلة|استرجاع/u.test(value)) return "support";
  if (/\b(find|search|product|catalog|price|available|do you have|show me)\b/u.test(value) ||
      /ابحث|أبحث|منتج|سعر|عندكم|موجود|أريد|اريد|بكم|كتالوج/u.test(value)) return "product_search";
  return "unknown";
}

export function acceptedModelIntent(output) {
  const candidate = typeof output === "string" ? output : output?.intent;
  return ALLOWED_INTENTS.includes(candidate) ? candidate : "unknown";
}

export function scopedProducts(rows, customerId, branchId = null) {
  if (!Array.isArray(rows)) throw assistantError("assistant_catalog_unavailable", 503);
  // Do not silently drop unverified extra records from a misconfigured provider.
  if (rows.length > 5) throw assistantError("assistant_catalog_scope_invalid", 502);
  return rows.map(row => {
    if (!row || row.customerId !== customerId ||
        (branchId !== null && row.branchId !== branchId) ||
        typeof row.itemId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(row.itemId) ||
        typeof row.displayName !== "string" || !row.displayName.trim()) {
      throw assistantError("assistant_catalog_scope_invalid", 502);
    }
    // Strict output allowlist: NO prices, supplier costs, VAT or stock assertions.
    return {
      itemId: row.itemId,
      name: row.displayName.slice(0, 120),
      ...(typeof row.sku === "string" ? { sku: row.sku.slice(0, 64) } : {})
    };
  });
}

export function scopedOrders(rows, customerId, branchId = null) {
  if (!Array.isArray(rows)) throw assistantError("assistant_orders_unavailable", 503);
  if (rows.length > 3) throw assistantError("assistant_orders_scope_invalid", 502);
  const statuses = new Set(["pending", "approved", "processing", "dispatched", "delivered", "cancelled", "on_hold"]);
  return rows.map(row => {
    if (!row || row.customerId !== customerId ||
        (branchId !== null && row.branchId !== branchId) ||
        typeof row.orderNumber !== "string" ||
        !/^[A-Za-z0-9._/-]{1,40}$/u.test(row.orderNumber) || !statuses.has(row.status)) {
      throw assistantError("assistant_orders_scope_invalid", 502);
    }
    return { orderNumber: row.orderNumber, status: row.status };
  });
}
