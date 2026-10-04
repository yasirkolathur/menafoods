import { makeIdempotencyKey, withIdempotency } from "../lib/idempotency.js";

export async function booksWebhook(ctx, event) {
  if (!event || typeof event !== "object") throw new Error("invalid_webhook_event");
  const externalId = event.payment_id || event.invoice_id || event.contact_id || event.id;
  const module = event.module || event.type;
  if (typeof externalId !== "string" && typeof externalId !== "number") throw new Error("webhook_record_id_required");
  if (!String(externalId).trim() || !module || typeof module !== "string" || !module.trim()) throw new Error("webhook_record_type_and_id_required");
  const key = makeIdempotencyKey("BOOKS", module, externalId);

  return withIdempotency({
    store: ctx.idempotencyStore,
    key,
    handler: async () => {
      const normalized = await ctx.books.normalizeEvent(event);
      await ctx.creator.upsertOperationalCache(normalized);
      await ctx.cache.invalidate(normalized.cache_keys || []);
      return { ok: true, key };
    }
  });
}
