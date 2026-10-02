export function makeIdempotencyKey(source, module, externalId) {
  if (!source || !module || !externalId) throw new Error("idempotency_key_parts_required");
  return [source, module, externalId].map(String).join(":");
}

/**
 * Requires a durable, atomic store with claim/get/complete/release.
 * A failed completion leaves the claim held: releasing after a successful
 * business write could cause the next delivery to execute it again.
 * Adapter implementations must supply lease recovery and reconciliation.
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

  let result;
  try {
    result = await handler();
  } catch (error) {
    // The adapter may release only after confirming the write did not commit.
    await store.release(key);
    throw error;
  }

  // Do not release claim if completion fails: the business write may exist.
  await store.complete(key, result);
  return { action: "created", ...result, idempotency_key: key };
}
