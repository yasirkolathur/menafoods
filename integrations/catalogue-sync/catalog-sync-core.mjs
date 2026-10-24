// Library for the EXISTING Catalyst mf_zoho_gateway (not a second service).
// Data adapters are intentionally injected: never embed tokens, organization IDs or secrets.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SYSTEMS = Object.freeze(["creator", "books", "commerce", "catalyst"]);
const ID_FIELDS = Object.freeze(["creator", "books", "commerce", "catalyst"]);
const TEXT_FIELDS = new Set(["name_en", "name_ar", "brand", "description_en",
  "description_ar", "sku", "barcode", "unit", "secondary_unit", "pack_description",
  "country_of_origin", "category_id", "collection_id"]);
const NUMERIC_FIELDS = new Set(["units_per_carton", "net_weight_kg", "catalog_rate"]);
const PRIVATE_FIELDS = new Set(["purchase_cost", "supplier_id", "margin", "profit",
  "supplier_prices", "vendor_bills", "credit_rules"]);
const ALLOWED = new Set([...TEXT_FIELDS, ...NUMERIC_FIELDS, "images", "published", ...PRIVATE_FIELDS]);
const CREATOR_KEYS = new Set([...TEXT_FIELDS, ...NUMERIC_FIELDS, "images", "published"]);
const COMMERCE_KEYS = new Set([...TEXT_FIELDS, "images", "published"]);
const BOOKS_KEYS = new Set([...TEXT_FIELDS, ...NUMERIC_FIELDS, "published", "purchase_cost", "supplier_id"]);
const CATALYST_KEYS = new Set([...TEXT_FIELDS, ...NUMERIC_FIELDS, "images", "published"]);
const BY_SOURCE = { creator: CREATOR_KEYS, books: BOOKS_KEYS, commerce: COMMERCE_KEYS,
  catalyst: CATALYST_KEYS };

const clean = value => typeof value === "string" ? value.trim() : value;
function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " required");
  return value.trim();
}
export function normalizeIdentity(ids = {}) {
  const normalized = Object.fromEntries(ID_FIELDS.flatMap(key => {
    const val = ids[key];
    return typeof val === "string" && val.trim() ? [[key, val.trim()]] : [];
  }));
  if (!Object.keys(normalized).length) throw new Error("An exact source product ID is required; names are not identifiers");
  return normalized;
}
export function verifiedWebhook(body, signature, secret) {
  if (typeof body !== "string" || !secret || !signature) return false;
  const input = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/i.test(input)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(input, "hex"));
}
export function assertProductEvent(event) {
  if (!event || event.type !== "catalog.product.upsert") throw new Error("Invalid product event");
  const tenantId = requiredString(event.tenantId, "tenantId");
  const eventId = requiredString(event.eventId, "eventId");
  const origin = requiredString(event.origin, "origin");
  if (!SYSTEMS.includes(origin)) throw new Error("Unknown origin");
  const ids = normalizeIdentity(event.ids);
  if (!ids[origin]) throw new Error("The origin must provide its own exact product ID");
  if (!event.adminAuthorized && origin === "catalyst") throw new Error("Authorized admin required");
  if (!event.fields || typeof event.fields !== "object" || Array.isArray(event.fields)) throw new Error("fields required");
  if (!Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0) throw new Error("expectedRevision required");
  const fields = {};
  for (const [key, val] of Object.entries(event.fields)) {
    if (!ALLOWED.has(key)) throw new Error("Unknown field: " + key);
    if (!BY_SOURCE[origin].has(key)) throw new Error("Field not writable from " + origin + ": " + key);
    if (val === undefined) continue;
    if (TEXT_FIELDS.has(key) && val !== null && typeof val !== "string") throw new Error("Invalid text: " + key);
    if (NUMERIC_FIELDS.has(key) && (!Number.isFinite(val) || val < 0)) throw new Error("Invalid number: " + key);
    if (key === "published" && typeof val !== "boolean") throw new Error("published must be boolean");
    if (key === "images" && !Array.isArray(val)) throw new Error("images must be an array");
    if (key === "purchase_cost" && (!Number.isFinite(val) || val < 0 || event.sourceDocumentType !== "verified_purchase_bill")) {
      throw new Error("Bills are authoritative for purchase_cost; verify actual buyer and bill first");
    }
    fields[key] = clean(val);
  }
  return { ...event, tenantId, eventId, origin, ids, fields };
}
function mergeIds(current = {}, incoming = {}) {
  const ids = { ...current };
  for (const [system, value] of Object.entries(incoming)) {
    if (ids[system] && ids[system] !== value) throw new Error("Product ID collision; quarantine for human review");
    ids[system] = value;
  }
  return ids;
}
export function serializePublicProduct(product) {
  if (!product?.fields?.published) return null;
  const f = product.fields;
  if (!Number.isFinite(f.catalog_rate) || f.catalog_rate <= 0) return null;
  const images = Array.isArray(f.images) ? f.images
    .filter(m => m && m.status === "approved" && m.usage_rights_confirmed === true && m.url)
    .map(m => ({ url: m.url, alt: m.alt || f.name_en || "",
      illustrative: m.illustrative === true })) : [];
  // Strict allowlist. NEVER return the rest of product.fields to the public client.
  return { id: product.publicId, sku: f.sku ?? "", barcode: f.barcode ?? "",
    name: f.name_en ?? "", name_ar: f.name_ar ?? "", brand: f.brand ?? "",
    description: f.description_en ?? "", description_ar: f.description_ar ?? "",
    category_id: f.category_id ?? "", collection_id: f.collection_id ?? "",
    unit: f.unit ?? "", secondary_unit: f.secondary_unit ?? "",
    units_per_carton: f.units_per_carton ?? null, pack_description: f.pack_description ?? "",
    catalog_rate: f.catalog_rate, images, revision: product.revision };
}
export function eventFingerprint(event) {
  const normalized = assertProductEvent(event);
  return createHash("sha256").update(JSON.stringify({
    tenantId: normalized.tenantId, origin: normalized.origin,
    ids: Object.keys(normalized.ids).sort().map(key => [key, normalized.ids[key]]),
    fields: Object.keys(normalized.fields).sort().map(key => [key, normalized.fields[key]])
  })).digest("hex");
}
/**
 * `store.transaction(fn)` MUST make seenEvent/findByExactIds/upsertProduct/
 * enqueueOutbox/markEventSeen atomic and durable in the existing Catalyst Datastore.
 * `authenticate` verifies tenant, signed source webhook, role and authorized fields
 * BEFORE invoking this function. No network calls belong inside this transaction.
 */
export async function ingestProductEvent(rawEvent, { store, authenticate }) {
  if (typeof authenticate !== "function") throw new Error("Authentication adapter required");
  await authenticate(rawEvent);
  const event = assertProductEvent(rawEvent);
  if (!store || typeof store.transaction !== "function") throw new Error("Transactional store required");
  return store.transaction(async tx => {
    const eventKey = event.tenantId + ":" + event.eventId;
    if (await tx.seenEvent(eventKey)) return { result: "already_processed" };
    const existing = await tx.findByExactIds(event.tenantId, event.ids);
    if (existing && existing.revision !== event.expectedRevision) {
      throw new Error("Revision conflict: retry after fetching latest product");
    }
    if (!existing && event.expectedRevision !== 0) throw new Error("New product must start with revision zero");
    const ids = mergeIds(existing?.ids, event.ids);
    const revision = (existing?.revision ?? 0) + 1;
    const saved = await tx.upsertProduct({
      tenantId: event.tenantId, ids, publicId: existing?.publicId,
      revision, fields: { ...(existing?.fields || {}), ...event.fields }
    });
    // Origin preserved through all outbound requests, suppressing webhook loops.
    for (const destination of SYSTEMS.filter(s => s !== event.origin)) {
      await tx.enqueueOutbox({ eventKey, tenantId: event.tenantId,
        productId: saved.publicId, destination, revision,
        origin: event.origin, rootEventId: event.rootEventId || event.eventId,
        idempotencyKey: eventKey + ":" + destination });
    }
    await tx.markEventSeen(eventKey);
    return { result: "queued", revision, productId: saved.publicId, destinations: 3 };
  });
}
