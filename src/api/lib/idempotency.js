export function makeIdempotencyKey(source, module, externalId) {
  if (!source || !module || !externalId) throw new Error("idempotency_key_parts_required");
  return [source, module, externalId].map(String).join(":");
}

export async function withIdempotency({ store, key, handler }) {
  if (!store || typeof handler !== "function") throw new Error("idempotency_store_and_handler_required");

  if (typeof store.claim === "function") {
    const claimed = await store.claim(key);
    if (!claimed) {
      const existing = typeof store.get === "function" ? await store.get(key) : null;
      return { action: "duplicate_noop", ...(existing || {}), idempotency_key: key };
    }

    try {
      const result = await handler();
      if (typeof store.complete === "function") await store.complete(key, result);
      else if (typeof store.put === "function") await store.put(key, result);
      return { action: "created", ...result, idempotency_key: key };
    } catch (error) {
      if (typeof store.release === "function") await store.release(key);
      throw error;
    }
  }

  const existing = typeof store.get === "function" ? await store.get(key) : null;
  if (existing) return { action: "duplicate_noop", ...existing, idempotency_key: key };

  const result = await handler();
  if (typeof store.put !== "function") throw new Error("idempotency_store_put_required");
  await store.put(key, result);
  return { action: "created", ...result, idempotency_key: key };
}
