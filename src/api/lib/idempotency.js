export function makeIdempotencyKey(source, module, externalId) {
  if (!source || !module || !externalId) throw new Error("idempotency_key_parts_required");
  return [source, module, externalId].map(String).join(":");
}

/**
 * Durable store contract:
 * claim(key): atomic, at most one owner; get(key): completed result or null;
 * complete(key, result): durable completion; release(key): explicitly
 * reconciled safe-to-retry claim only.
 *
 * A write may have committed even when a network call throws. The helper
 * therefore intentionally does NOT release on handler or completion errors.
 * An independent reconciliation process must inspect the authoritative
 * Books/Inventory state before deciding whether a claim can be retried.
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
    return existing
      ? { action: "duplicate_noop", ...existing, idempotency_key: key }
      : { action: "in_progress", idempotency_key: key };
  }

  // Both failed handler and failed completion retain the claim. Never
  // automatically replay a potentially committed financial mutation.
  const result = await handler();
  await store.complete(key, result);
  return { action: "created", ...result, idempotency_key: key };
}
