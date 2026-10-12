import {
  assistantError, parseAssistantRequest, redactForClassifier,
  detectIntent, extractIntentHints, acceptedModelIntent, scopedProducts, scopedOrders
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
      // Only preapproved words generated server-side; never raw user text.
      text,
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
  if (!ctx?.user?.id || typeof ctx.auth?.getAssistantScope !== "function") {
    throw assistantError("authenticated_context_required", 401);
  }
  if (ctx.flags?.assistantEnabled !== true) {
    throw assistantError("assistant_disabled", 503); // explicit default OFF kill switch
  }
  const { text, locale } = parseAssistantRequest(body);
  let scope;
  try {
    scope = await ctx.auth.getAssistantScope();
  } catch {
    throw assistantError("assistant_forbidden", 403);
  }
  if (!scope || scope.principalId !== ctx.user.id || typeof scope.customerId !== "string" ||
      !scope.customerId || scope.active !== true || scope.role !== "customer" ||
      !Array.isArray(scope.permissions) || !scope.permissions.includes("assistant.use") ||
      (scope.branchScoped === true && !scope.branchId) ||
      (scope.branchId !== undefined &&
       (typeof scope.branchId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(scope.branchId)))) {
    throw assistantError("assistant_forbidden", 403);
  }
  if (!["web", "android", "whatsapp"].includes(ctx.channel)) {
    throw assistantError("assistant_channel_unverified", 403);
  }
  if (ctx.channel === "whatsapp" &&
      (ctx.proof?.verifiedSender !== true ||
       ctx.proof?.signatureVerified !== true ||
       ctx.proof?.replayChecked !== true ||
       ctx.proof?.consentConfirmed !== true ||
       ctx.proof?.linkedCustomerId !== scope.customerId)) {
    throw assistantError("whatsapp_identity_unverified", 403);
  }
  if (typeof ctx.rateLimiter?.consume !== "function") throw assistantError("assistant_limits_unavailable", 503);
  let limit;
  try {
    limit = await ctx.rateLimiter.consume({
      key: "assistant:" + scope.customerId + ":" + ctx.user.id,
      limit: 30, windowSeconds: 3600
    });
  } catch {
    throw assistantError("assistant_limits_unavailable", 503);
  }
  if (limit?.allowed === false) throw assistantError("assistant_rate_limited", 429);
  if (limit?.allowed !== true) throw assistantError("assistant_limits_unavailable", 503);

  let intent = detectIntent(text), usedModel = false;
  const hints = extractIntentHints(text);
  if (intent === "unknown" && hints && ctx.flags.modelEnabled === true &&
      typeof ctx.model?.classifyIntent === "function") {
    usedModel = true;
    intent = await classifyOnce(ctx, hints);
  }
  if (intent === "unknown") intent = "support"; // safe deterministic fallback

  const mayViewAllBranches = scope.allBranchesAllowed === true &&
    scope.permissions.includes("assistant.all_branches");
  let products = [], orders = [];
  if (intent === "product_search") {
    if (!ctx.catalog?.searchForCustomer) throw assistantError("assistant_catalog_unavailable", 503);
    // Scope is server-derived; catalog is NOT allowed to trust any client customer ID.
    const filters = { customerId: scope.customerId, query: redactForClassifier(text), limit: 5 };
    if (scope.branchId) filters.branchId = scope.branchId;
    let rows;
    try {
      rows = await ctx.catalog.searchForCustomer(filters);
    } catch {
      throw assistantError("assistant_catalog_unavailable", 503);
    }
    products = scopedProducts(rows, scope.customerId, scope.branchId ?? null, mayViewAllBranches);
  }
  if (intent === "order_status") {
    if (!ctx.orders?.listRecentForCustomer) throw assistantError("assistant_orders_unavailable", 503);
    const filters = { customerId: scope.customerId, limit: 3 };
    if (scope.branchId) filters.branchId = scope.branchId;
    let rows;
    try {
      rows = await ctx.orders.listRecentForCustomer(filters);
    } catch {
      throw assistantError("assistant_orders_unavailable", 503);
    }
    orders = scopedOrders(rows, scope.customerId, scope.branchId ?? null, mayViewAllBranches);
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
