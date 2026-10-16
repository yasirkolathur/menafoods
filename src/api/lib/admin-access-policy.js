/**
 * Proposed MENAFoods Admin permission boundary (source-only, not deployed).
 *
 * Integration rule: verifySession and lookupMemberships MUST be trusted
 * server-side functions. Never pass browser-supplied users, roles, grants,
 * or business lists as results of these callbacks.
 *
 * Passing this guard is necessary but not sufficient for write operations:
 * use explicit user confirmation, authoritative provider authorization,
 * atomic idempotency and immutable audit trails downstream.
 */
const READ_ACTIONS = new Set([
  'admin.dashboard.read',
  'admin.onboarding.read',
  'admin.products.read',
  'admin.purchase_orders.read',
  'admin.integrations.read',
  'admin.notifications.read'
]);
const WRITE_ACTIONS = new Set([
  'admin.onboarding.approve',
  'admin.onboarding.reject',
  'admin.products.approve',
  'admin.products.reject',
  'admin.purchase_orders.acknowledge'
]);
const KNOWN_ACTIONS = new Set([...READ_ACTIONS, ...WRITE_ACTIONS]);
const ROLES = new Set(['ADMIN', 'OWNER']);

function denied(status, reason) {
  const error = new Error(reason);
  error.status = status;
  return error;
}

/**
 * @param {object} request - Validated server-side context and action.
 * @param {string} request.sessionToken - Opaque credential, sent only to verifier.
 * @param {string} request.businessId - Scoped business identifier.
 * @param {string} request.action - Exact allowlisted operation.
 * @param {(token: string) => Promise<{id:string}|null>} request.verifySession
 * @param {(userId: string) => Promise<Array<{businessId:string,role:string,status:string,grants:string[]}>>} request.lookupMemberships
 */
export async function authorizeAdminAction({sessionToken, businessId, action, verifySession, lookupMemberships} = {}) {
  if (!KNOWN_ACTIONS.has(action)) throw denied(403, 'operation_forbidden');
  if (typeof verifySession !== 'function' || typeof lookupMemberships !== 'function') {
    throw denied(503, 'authorization_unavailable');
  }
  if (typeof sessionToken !== 'string' || !sessionToken.trim()) {
    throw denied(401, 'authentication_required');
  }
  if (typeof businessId !== 'string' || !businessId.trim()) {
    throw denied(403, 'business_scope_required');
  }
  let user;
  try {
    user = await verifySession(sessionToken);
  } catch {
    throw denied(401, 'authentication_required');
  }
  if (!user || typeof user.id !== 'string' || !user.id.trim()) {
    throw denied(401, 'authentication_required');
  }
  let memberships;
  try {
    memberships = await lookupMemberships(user.id);
  } catch {
    throw denied(503, 'authorization_unavailable');
  }
  if (!Array.isArray(memberships)) throw denied(503, 'authorization_unavailable');

  const scoped = memberships.find(m => m && m.businessId === businessId &&
    m.status === 'ACTIVE' && ROLES.has(m.role));
  if (!scoped) throw denied(403, 'permission_denied');

  const write = WRITE_ACTIONS.has(action);
  // A title like ADMIN or OWNER is not itself a financial authorization.
  if (write && (!Array.isArray(scoped.grants) || !scoped.grants.includes(action))) {
    throw denied(403, 'permission_denied');
  }
  return Object.freeze({userId:user.id, businessId, role:scoped.role, action, write});
}
