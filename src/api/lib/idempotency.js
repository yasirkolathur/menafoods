export function makeIdempotencyKey(source, module, externalId) {
  if (!source || !module || !externalId) throw new Error("idempotency_key_parts_required");
  return [source, module, externalId].map(String).join(":");
}

/**
 * The storage adapter MUST implement atomic claim(key), get(key),
 * complete(key, result) and release(key). claim must succeed for only
 * one concurrent request. This helper intentionally has no get/put
 * fallback: such a fallback allows duplicate financial writes.
 */
export async function withIdempotency({ store, key, handler }) {
  if (!key || typeof handler !== "function" ||
    !store || !["claim", "get", "complete", "release"].every(
      method => typeof store[method] === "function"
    )) {
    throw new Error("atomic_idempotency_store_required");
  }

  const claimed = await store.claim(key);
  if (!claimed) {
    const existing = await store.get(key);
    if (!existing) {
      return { action: "in_progress", idempotency_key: key };
    }
    return { action: "duplicate_noop", ...existing, idempotency_key: key };
  }

  try {
    const result = await handler();
    await store.complete(key, result);
    return { action: "created", ...result, idempotency_key: key };
  } catch (error) {
    await store.release(key);
    throw error;
  }
}
