/**
 * Development-only AI browser pilot gate for the EXISTING MENAFoods gateway.
 *
 * DRAFT LIBRARY ONLY: importing this file does not wire it into Catalyst.
 * Trusted session, membership, target, parsed request and downstream DTO
 * projection MUST come from the server, never the requesting browser.
 */
import { assertCatalystProject } from './project-lock.js';

const ALLOWED_PATHS = Object.freeze([
  /^\/mf-api\/health$/,
  /^\/mf-api\/categories$/,
  /^\/mf-api\/products$/,
  /^\/mf-api\/products\/[A-Za-z0-9_-]{1,64}$/
]);
const QUERY_KEYS = new Set([
  'q', 'page', 'page_size', 'limit', 'cursor', 'category', 'business_id'
]);
const SENSITIVE_KEYS = new Set([
  'customer_id', 'customerid', 'user_id', 'userid', 'supplier_id',
  'supplierid', 'role', 'admin', 'api_key', 'token', 'secret'
]);

function reject(status, reason) {
  const error = new Error(reason);
  error.status = status;
  return error;
}

/**
 * Project an authorized, already business-scoped product to a safe
 * public pilot DTO. Never return raw Zoho/Creator/Books products directly.
 * Do not add price, stock quantity, supplier, cost, margin or customer data
 * until the separate authoritative pricing/privacy gates have passed.
 */
export function toPilotPublicProduct(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw reject(502, 'invalid_pilot_product');
  }
  // Require a *server-normalized* visibility decision backed by authoritative
  // active/storefront flags. A missing flag is NOT permission to publish.
  if (product.is_active !== true || product.is_storefront !== true) {
    throw reject(403, 'pilot_product_not_public');
  }
  const publicFields = [
    'id', 'name', 'name_ar', 'category_name', 'unit', 'image_url'
  ];
  const out = Object.create(null);
  for (const key of publicFields) {
    if (Object.prototype.hasOwnProperty.call(product, key) &&
        typeof product[key] === 'string' &&
        product[key].length <= (key === 'image_url' ? 1500 : 250)) {
      const value = product[key].trim();
      if (key === 'image_url') {
        // Image URL is optional. Do not render script/data URI schemes.
        if (!/^\/(?!\/)[^\s]*$/.test(value) &&
            !/^https:\/\/[^@\s/]+\/[^\s]*$/i.test(value)) continue;
      }
      out[key] = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(product, 'is_available') &&
      typeof product.is_available === 'boolean') {
    out.is_available = product.is_available;
  }
  if (!out.id || !out.name) throw reject(502, 'invalid_pilot_product');
  return Object.freeze(out);
}

function validateQuery(query, businessId) {
  if (query == null) return null;
  if (!(query instanceof URLSearchParams)) return 'invalid_pilot_query';
  const seen = new Set();
  let count = 0;
  for (const [rawKey, value] of query) {
    count += 1;
    if (count > 8) return 'pilot_query_too_many';
    const key = rawKey.toLowerCase().replaceAll('-', '_');
    if (seen.has(key)) return 'pilot_duplicate_query_key';
    seen.add(key);
    if (SENSITIVE_KEYS.has(key) || !QUERY_KEYS.has(key)) {
      return 'pilot_query_forbidden';
    }
    if (key === 'business_id' && value !== businessId) {
      return 'pilot_business_scope_mismatch';
    }
    if (value.length > 256) return 'pilot_query_too_long';
    if ((key === 'page' || key === 'page_size' || key === 'limit') &&
        (!/^[1-9]\d{0,3}$/.test(value) ||
         Number(value) > (key === 'page' ? 500 : 50))) {
      return 'pilot_invalid_pagination';
    }
    if (key === 'q' && (value.length > 80 || /[\x00-\x1f]/.test(value))) {
      return 'pilot_invalid_search';
    }
    if (key === 'category' && !/^[\p{L}\p{N}_ -]{1,64}$/u.test(value)) {
      return 'pilot_invalid_category';
    }
    if (key === 'cursor' && !/^[\w.=-]{1,256}$/.test(value)) {
      return 'pilot_invalid_cursor';
    }
  }
  return null;
}

/**
 * lookupMembership(userId) queries trusted server-side store.
 * audit(event) logs no identifiers, tokens, query strings or raw responses.
 * Membership expires automatically; it must be approved explicitly.
 */
export async function authorizePilotBrowser({
  session, request, target, lookupMembership, audit
}) {
  if (typeof audit !== 'function' || typeof lookupMembership !== 'function') {
    throw reject(503, 'pilot_guard_not_configured');
  }
  const deny = async (status, reason) => {
    await audit({ action: 'pilot_access_denied', status, reason });
    throw reject(status, reason);
  };

  if (target?.environment !== 'Development') return deny(403, 'development_only');
  try {
    assertCatalystProject(target);
  } catch {
    return deny(403, 'project_not_allowed');
  }

  // Verified identity must be injected by trusted session middleware.
  if (session?.verified !== true || typeof session.userId !== 'string' ||
      !session.userId.trim()) {
    return deny(401, 'authenticated_pilot_session_required');
  }
  let member;
  try {
    member = await lookupMembership(session.userId);
  } catch {
    return deny(503, 'pilot_membership_unavailable');
  }

  const expiration = Date.parse(member?.expiresAt ?? '');
  if (!member || member.userId !== session.userId ||
      member.role !== 'PILOT_AI_AGENT' || member.status !== 'ACTIVE' ||
      member.readOnly !== true || member.emailConfirmed !== true ||
      typeof member.approvedBy !== 'string' || !member.approvedBy.trim() ||
      typeof member.businessId !== 'string' || !member.businessId.trim() ||
      !Number.isFinite(expiration) || expiration <= Date.now()) {
    return deny(403, 'pilot_membership_not_approved');
  }

  const method = String(request?.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return deny(405, 'pilot_read_only');

  const path = request?.pathname;
  if (typeof path !== 'string' || !ALLOWED_PATHS.some(re => re.test(path))) {
    return deny(403, 'pilot_route_not_allowlisted');
  }

  const queryIssue = validateQuery(request?.query, member.businessId);
  if (queryIssue) return deny(403, queryIssue);

  await audit({ action: 'pilot_access_allowed', status: 200, reason: 'read_only' });
  return Object.freeze({
    permitted: true,
    readOnly: true,
    role: 'PILOT_AI_AGENT',
    userId: session.userId,
    businessId: member.businessId,
    method
  });
}
