# MENAFoods — Development AI Browser Pilot (read-only)

**Updated:** 2026-10-17  
**Scope:** Existing `menafoodscustomermiddleware` project, `mf_zoho_gateway`, `MENAFoodsCustomer` only.  
**State:** Source guard + tests prepared on a draft PR; **NOT connected to the deployed gateway and NOT deployed**.

## Inventory findings (redacted)

- Catalyst Authentication in the target Development environment lists only **App Administrator** and **App User** platform roles. Do **not** give browser automation App Administrator.
- An existing **MENAFoods Pilot** App User is active but email confirmation is false. Do not impersonate, re-invite, duplicate, elevate, or assume ownership of that identity. A nominated owner must confirm which login may be used for this pilot.
- A separate TinyFish **MENAFoods Catalyst Development — Pilot AI Agent** browser profile was created. User must open the secure profile setup link, sign in with an authorized pilot login, and select Save profile. Do not paste passwords/OTP into GitHub or chat.
- Catalyst Datastore ACL and sensitive function metadata review remain P0 blockers.

## Phase A — Safe pilot design

1. Validate an authorized pilot email/account owner and ownership of the existing account. If no approved account is available, obtain a unique owner-provided pilot email, then invite it in **Development** only as App User (never App Administrator); require email confirmation. Use existing auth stack, no shadow login.
2. Add **server-side** pilot membership record after approval with `userId`, `role=PILOT_AI_AGENT`, `status=ACTIVE`, `readOnly=true`, allowed `businessId`, future `expiresAt`, `emailConfirmed=true`, `approvedBy` (Owner identifier). The application role here is a limited membership attached to an authenticated Catalyst App User; no claim that a native Catalyst pilot role already exists.
3. Restrict DataStore ACLs; no browser-side permission decisions. Backend must obtain trusted membership and verified session from server infrastructure, **not** a client-supplied flag/header.
4. Call `authorizePilotBrowser` inside the actual recovered gateway **before** dispatching any authenticated pilot action. Pass the immutable project target and parsed route/method/query. Enforce its returned `businessId` on every downstream provider read and call `toPilotPublicProduct` for every product record returned to the pilot. The safe projection rejects items without server-normalized `is_active=true` and `is_storefront=true` booleans, and excludes price, cost, margin, supplier details, inventory quantities and customer data. Any uncertain/inactive/unpublished product is denied. The source mapping and visibility checks require authenticated Development verification.
5. Initial allowlist: `GET/HEAD` health, categories, products and one product detail. **Bootstrap is denied** until its profile/permissions DTO is separately sanitized and authorized. **Never** allow AI agent to POST/PATCH/DELETE, call admin/finance/wallet/order endpoints, read supplier costs, or run privileged web UI interactions.
6. Allow only validated product search and pagination query keys (`q`, `page`, `page_size`, `limit`, `cursor`, `category`, and a matching `business_id`). Reject duplicates, unfamiliar parameters, excessive length and cross-business scope. Use the server-assigned business identifier for every downstream read, regardless of browser query.
7. Maintain a redacted append-only access log (user identity reference, action, time, route class, outcome, correlation ID) with retention and stop switch, never query content, credentials or raw customer data.
8. Only broaden permissions later after explicit Owner approval and separate test evidence; the pilot guard is intentionally not an Admin impersonation mechanism.

## Phase B — Browser session

1. Open the separately created browser profile's one-time setup link with the correct user and follow the site login flow. Save profile within the TinyFish UI. The profile ID is an internal browser-session reference, not a customer login.
2. Check that pilot App User account is confirmed and has only approved server-side membership. Unconfirmed current Pilot account is **not ready**.
3. Run a read-only browser smoke test: homepage → Categories → product search → product details → logout; confirm no writes and no Admin entry.
4. If authenticated checks fail, **stop**, capture a redacted result; never elevate the pilot user to App Administrator for convenience.
5. Run boundary tests for business switching, URL tampering, hidden products, role escalation, expired session, cross-tenant access, and stale browser profile.
6. Revoke membership at the end of the pilot; revoke sessions and remove the stored browser profile through approved controls.

## Unit checks

`npm run check && npm test` (the expanded pilot access-policy and product-projection test suite plus existing core tests). Confirm exact case count from GitHub CI.

**Warning:** The guard alone does not sanitize response data; the real gateway must call the safe projection before any pilot-readable product response. It cannot retrofit permissions to a browser session by itself.

The library is **not** integrated into the actual hosted gateway because current deployed source equivalence has not been proven. A green test here must not be interpreted as authenticated end-to-end verification.

## Required deployment evidence

- Verified deployed source SHA, Catalyst release/deploy receipt, encrypted private rollback archive.
- Owner-approved pilot login and server-side membership; email confirmed, user/role scope captured privately.
- Redacted unit/role/scope checks and successful authorized browser test.
- No secret, cost, OTP or cross-business data exposure.
- **Production remains NO-GO** until normal release gates pass.
