# MENAFoods Admin access policy — source-only handoff (16 Oct 2026)

This draft adds a **pure authorization helper and tests only** to existing `yasirkolathur/menafoods` scaffolding on top of `catalyst-core-p0`. It is **not wired into or deployed to the actual Catalyst gateway**.

## Target existing runtime
- Catalyst project: `menafoodscustomermiddleware` / ID `17990000000237407` / Development only.
- Existing function: `mf_zoho_gateway` / Node 24. Reuse existing protected routes; do **not** introduce a second backend or database.
- Existing frontend: `MENAFoodsCustomer` / `/app/` Command Center.
- Existing Creator source: `menafoods/mena`, including `Sales_Order_ZBooks`, `Bill_Books`, `Purchase_Order`, and product approval reports.
- This public GitHub repository **does not contain** authoritative deployed private gateway/client source. Do not publish it or secrets.

## What this patch enforces when correctly wired
- Only server-side **verified session** and **trusted active ADMIN/OWNER business membership** can authorize a known Admin action.
- Exact `businessId` match; no cross-business Owner/Admin shortcut.
- Read actions: dashboard, onboarding, products, purchase orders, integrations, notifications.
- Write actions: product approve/reject, onboarding approve/reject and PO acknowledgement require exact explicit trusted grant, even for Owner.
- Unknown operations, credential rotation, role escalation, finance/payment, ledger or release operations are **not** accepted as actions.
- Resolver outages deny access; session errors do not echo provider details or raw tokens.

## Mandatory integration instructions
1. Export and hash actual Catalyst Development source and obtain rollback/deployment receipt; compare with PR #14 and any newer private security patch before applying.
2. Reuse the deployed gateway's **real session verification** as `verifySession`. No browser-supplied `verified`, `role`, `grants`, `customerId` or `membership` may serve as authentication evidence.
3. Implement `lookupMemberships(userId)` using server-controlled authoritative membership table and enforce business scope **in the downstream Creator/Books/Inventory adapter as well**. Ensure no stale cached grants survive revocation.
4. Map actual HTTP routes onto the exact action names after inspecting authoritative gateway code; this PR intentionally does **not** invent or mount routes.
5. For write workflows, require affirmative user confirmation, source-specific authorization and audit, idempotency and provider reconciliation. `authorizeAdminAction` itself does not execute an approval.
6. Before enabling any Admin action, test unauthenticated 401, non-Admin 403, revoked user, cross-business 403, forged client role/grants, unsupported operations, backend outage, concurrent repeat approvals and history/audit correctness.
7. Verify secrets and Datastore ACLs through restricted administrative tools. Catalyst metadata has previously exposed sensitive environment values; never paste values into this issue, log, PR, or tests.
8. Run `npm run check && npm test` on the branch in a trusted runner, then an authenticated **actual Catalyst Development** E2E before claiming success. Development/Production promotion requires explicit Owner approval.

## Local evidence
On the standalone Node 22 test fixture, **18/18** new policy tests passed with `node --check src/api/lib/admin-access-policy.js` and `node --test test/admin-access-policy.test.js`. Node 24 and full-branch CI still require independent verification.

**Release state:** Admin integration NO-GO. This is a reusable staged policy, **not an enforcement claim about hosted code**.

Related: #15 #16 #25 #26 #27 #28, draft PR #14.
