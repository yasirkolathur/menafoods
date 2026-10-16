/**
 * MENAFoods Development-only AI browser pilot authorization guard.
 * This is a composable guard, not a registered endpoint or Catalyst role.
 * Caller MUST obtain session and membership from trusted server sources.
 * Never derive either from request headers, query strings or browser state.
 */
import { assertCatalystProject } from './project-lock.js';

const SAFE_READS = Object.freeze([
  /^\/mf-api\/health$/,
  /^\/mf-api\/bootstrap$/,
  /^\/mf-api\/categories$/,
  /^\/mf-api\/products$/,
  /^\/mf-api\/products\/[A-Za-z0-9_-]+$/
]);
const SENSITIVE_KEYS = new Set([
  'customer_id', 'customerid', 'user_id', 'userid', 'supplier_id',
  'supplierid', 'role', 'admin', 'api_key', 'token', 'secret'
]);

function pilotError(status, reason) {
  const error = new Error(reason);
  error.status = status;
  return error;
}

/**
 * Return only server-assigned read-only business scope.
 * lookupMembership(userId) MUST query a trusted server-side membership store.
 * audit(event) receives only redacted action/status/reason, never tokens/URLs.
 */
export async function authorizePilotBrowser({ session, request, target, lookupMembership, audit }) {
  if (typeof audit !== 'function' || typeof lookupMembership !== 'function') {
    throw pilotError(503, 'pilot_guard_not_configured');
  }

  const deny = async (status, reason) => {
    await audit({ action: 'pilot_access_denied', status, reason });
    throw pilotError(status, reason);
  };

  if (target?.environment !== 'Development') return deny(403, 'development_only');
  try {
    assertCatalystProject(target);
  } catch {
    return deny(403, 'project_not_allowed');
  }

  // A verified flag must come from the trusted Catalyst gateway, never the client.
  if (session?.verified !== true || !session.userId || typeof session.userId !== 'string') {
    return deny(401, 'authenticated_pilot_session_required');
  }

  const member = await lookupMembership(session.userId);
  if (!member || member.userId !== session.userId ||
      member.role !== 'PILOT_AI_AGENT' || member.status !== 'ACTIVE' ||
      member.readOnly !== true || typeof member.businessId !== 'string' ||
      member.businessId.trim().length === 0) {
    return deny(403, 'pilot_membership_not_approved');
  }

  const method = String(request?.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return deny(405, 'pilot_read_only');

  const rawPath = request?.pathname;
  if (typeof rawPath !== 'string' || !SAFE_READS.some(pattern => pattern.test(rawPath))) {
    return deny(403, 'pilot_route_not_allowlisted');
  }

  // Require already-parsed query, never request body supplied by caller.
  const query = request?.query;
  if (query && !(query instanceof URLSearchParams)) return deny(403, 'invalid_pilot_query');
  for (const [key, value] of query || []) {
    const normalized = key.toLowerCase().replaceAll('-', '_');
    if (SENSITIVE_KEYS.has(normalized)) return deny(403, 'pilot_query_forbidden');
    if ((normalized === 'business_id' || normalized === 'businessid') && value !== member.businessId) {
      return deny(403, 'pilot_business_scope_mismatch');
    }
  }

  await audit({ action: 'pilot_access_allowed', status: 200, reason: 'read_only' });
  return Object.freeze({
    permitted: true,
    readOnly: true,
    userId: session.userId,
    businessId: member.businessId,
    role: 'PILOT_AI_AGENT',
    method
  });
}
