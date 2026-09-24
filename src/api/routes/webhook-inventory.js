import { makeIdempotencyKey, withIdempotency } from "../lib/idempotency.js";

export async function inventoryWebhook(ctx, event) {
  const externalId = event.shipment_id || event.package_id || event.item_id || event.id;
  const module = event.module || event.type || "UNKNOWN";
  const key = makeIdempotencyKey("INVENTORY", module, externalId);

  return withIdempotency({
    store: ctx.idempotencyStore,
    key,
    handler: async () => {
      const normalized = await ctx.inventory.normalizeEvent(event);
      await ctx.creator.upsertOperationalCache(normalized);
      await ctx.cache.invalidate(normalized.cache_keys || []);
      return { ok: true, key };
    }
  });
}
