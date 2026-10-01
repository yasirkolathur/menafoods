import { makeIdempotencyKey, withIdempotency } from "../lib/idempotency.js";

export async function booksWebhook(ctx, event) {
  const externalId = event.payment_id || event.invoice_id || event.contact_id || event.id;
  const module = event.module || event.type || "UNKNOWN";
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
