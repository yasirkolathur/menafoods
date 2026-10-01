export function makeIdempotencyKey(source, module, externalId) {
  if (!source || !module || !externalId) throw new Error("idempotency_key_parts_required");
  return `${source}:${module}:${externalId}`;
}

export async function withIdempotency({ store, key, handler }) {
  const existing = await store.get(key);
  if (existing) return { action: "duplicate_noop", ...existing };

  const result = await handler();
  await store.put(key, result);
  return { action: "created", ...result };
}
