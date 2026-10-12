import {
  assistantError, parseAssistantRequest, redactForClassifier,
  detectIntent, acceptedModelIntent, scopedProducts, scopedOrders
} from "../lib/assistant-policy.js";

const MESSAGES = Object.freeze({
  en: {
    product_search: "Matching catalog items are shown below. Check the current price, availability and VAT in your authenticated cart.",
    reorder: "Open Buy Again to review a previous order. Current prices, stock and credit are checked only at checkout.",
    order_status: "Here are your latest order statuses from your business account.",
    support: "Open customer support for assistance. An order will not be placed by this assistant."
  },
  ar: {
    product_search: "هذه المنتجات المطابقة. تحقق من السعر والتوفر والضريبة الحالية داخل سلة حسابك.",
    reorder: "افتح اطلب مجدداً لمراجعة طلب سابق. يتم التحقق من الأسعار والمخزون والائتمان عند إتمام الطلب.",
    order_status: "إليك حالات طلبات حساب منشأتك الأخيرة.",
    support: "افتح خدمة العملاء للمساعدة. لن ينشئ المساعد أي طلب."
  }
});
const ACTIONS = Object.freeze({
  product_search: "OPEN_CATALOG",
  reorder: "OPEN_BUY_AGAIN",
  order_status: "OPEN_ORDERS",
  support: "OPEN_SUPPORT"
});

async function classifyOnce(ctx, text) {
  if (typeof ctx.model?.classifyIntent !== "function") return "unknown";
  const controller = new AbortController();
  let timer;
  try {
    const request = Promise.resolve().then(() => ctx.model.classifyIntent({
      text: redactForClassifier(text),
      allowedIntents: ["product_search", "reorder", "order_status", "support"],
      maxOutputTokens: 24,
      signal: controller.signal
    }));
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 1000);
    });
    return acceptedModelIntent(await Promise.race([request, timeout]));
  } catch {
    return "unknown"; // no retries, no customer text or provider errors in logs
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wire ONLY into the recovered existing Catalyst gateway after verifying its
 * deployed source and server-provided identity. Gateway must map authenticated
 * session or verified WhatsApp sender -> customer before this handler is called.
 * No provider writes or Sales Order side effects exist here.
 */
export async function assistantHelp(ctx, body) {
  const { text, locale } = parseAssistantRequest(body);
  if (!ctx?.user?.id || !ctx.auth?.getAssistantScope) {
    throw assistantError("authenticated_context_required", 401);
  }
  const scope = await ctx.auth.getAssistantScope();
  if (!scope || scope.principalId !== ctx.user.id || typeof scope.customerId !== "string" ||
      !scope.customerId || scope.active !== true || scope.role !== "customer" ||
      !Array.isArray(scope.permissions) || !scope.permissions.includes("assistant.use")) {
    throw assistantError("assistant_forbidden", 403);
  }
  if (!["web", "android", "whatsapp"].includes(ctx.channel)) {
    throw assistantError("assistant_channel_unverified", 403);
  }
  if (ctx.channel === "whatsapp" &&
      (ctx.proof?.verifiedSender !== true ||
       ctx.proof?.linkedCustomerId !== scope.customerId)) {
    throw assistantError("whatsapp_identity_unverified", 403);
  }
  if (!ctx.rateLimiter?.consume) throw assistantError("assistant_limits_unavailable", 503);
  const limit = await ctx.rateLimiter.consume({
    key: "assistant:" + scope.customerId + ":" + ctx.user.id,
    limit: 30, windowSeconds: 3600
  });
  if (limit?.allowed !== true) throw assistantError("assistant_rate_limited", 429);

  let intent = detectIntent(text), usedModel = false;
  if (intent === "unknown" && ctx.model?.classifyIntent) {
    usedModel = true;
    intent = await classifyOnce(ctx, text);
  }
  if (intent === "unknown") intent = "support"; // safe deterministic fallback

  let products = [], orders = [];
  if (intent === "product_search") {
    if (!ctx.catalog?.searchForCustomer) throw assistantError("assistant_catalog_unavailable", 503);
    // Scope is server-derived; catalog is NOT allowed to trust any client customer ID.
    products = scopedProducts(await ctx.catalog.searchForCustomer({
      customerId: scope.customerId, query: redactForClassifier(text), limit: 5
    }), scope.customerId);
  }
  if (intent === "order_status") {
    if (!ctx.orders?.listRecentForCustomer) throw assistantError("assistant_orders_unavailable", 503);
    orders = scopedOrders(await ctx.orders.listRecentForCustomer({
      customerId: scope.customerId, limit: 3
    }), scope.customerId);
  }

  try {
    await ctx.telemetry?.record?.({
      event: "assistant_intent",
      intent, channel: ctx.channel, usedModel,
      resultCount: products.length + orders.length
    });
  } catch {
    // Metrics failures must not leak PII or trigger retries/posting.
  }
  return {
    ok: true, locale, intent,
    answer: MESSAGES[locale][intent], products, orders,
    suggested_action: { kind: ACTIONS[intent], requires_confirmation: true },
    order_submitted: false
  };
}
