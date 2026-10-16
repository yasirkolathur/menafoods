# MENAFoods Development Datastore ACL verification — 16 Oct 2026

**Target:** Existing Catalyst `menafoodscustomermiddleware`, project `17990000000237407`, organization `809407193`, **Development environment only**.

**Authorization:** Owner approved Development-only Super Admin work. No Production, real payment, Zoho financial record, user elevation, source deployment or destructive table operation was performed.

## Read-only baseline

- Existing Catalyst project and `mf_zoho_gateway` function were confirmed; `/mf-api/health` returned `ok=true`, reported version `12.3.26`.
- Existing web client `MENAFoodsCustomer` route `/app/` responds.
- 58 existing Datastore tables listed; all 58 permissions reviewed with Catalyst management API.
- **Before remediation:** 56/58 tables had no direct `App User` operations. Exactly two allowed `App User: SELECT` with `GLOBAL` scope:
  - `Activities`: contains free-text activity content, source/type/status and entity references.
  - `MF_Product_Category_Map`: contains `TENANT_KEY`, item/SKU, category and alternate item references.
- Other tables already denied `App User`; all remained unchanged.

## Development-only ACL updates applied and verified

| Table | Before App User | After App User | App Administrator (unchanged) |
|---|---|---|---|
| `Activities` | `SELECT` | none | `SELECT`, `UPDATE`, `INSERT`, `DELETE` |
| `MF_Product_Category_Map` | `SELECT` | none | `SELECT`, `UPDATE`, `INSERT`, `DELETE` |

Both writes returned `status: success`; a separate fresh permission GET confirmed both desired ACLs. **No rows were read, modified or deleted, and table scopes were not changed.**

## Post-change smoke

- Public Development `/app/#categories`: MENAFoods Customer and Categories text returned; business sign-in section also present.
- Development `/mf-api/health`: `ok=true`, service `mf_zoho_gateway`, version `12.3.26`.
- **Not tested:** actual signed-in App User direct Datastore negative SELECT, owner/Admin session E2E, browser requests behind login, business/branch isolation, Commerce pagination, checkout, Creator/Books financial order flow. Do not mark the application or Production as secure/released from this ACL check alone.

## Exact rollback if an authenticated Development dependency fails

If the authorized signed-in user flow turns out to require direct reads of either table, investigate a safer server-proxied scoped route first. The previous ACLs were:
- `Activities`: `App Administrator = [SELECT, UPDATE, INSERT, DELETE]`; `App User = [SELECT]`.
- `MF_Product_Category_Map`: same.
- Do not grant `INSERT/UPDATE/DELETE` to App User, and never grant broad wallet/order/customer table access.

## Next hardening gates

1. Independently test authenticated App User SELECT denied and scoped Catalyst server reads succeed.
2. Review `public_signup=true` as a separate onboarding policy decision; no global auth setting changed here.
3. Recover authoritative deployed private source/hash and rollback artifact before wiring PR #33 Admin guard or source candidate.
4. Rotate exposed secrets through authorized secured channel and retest dependent webhook/OAuth/session flows. **No secret value may enter public GitHub.**
5. Fail-closed customer/business isolation, catalog visibility and exactly-one order E2E must pass before any pilot.

**Release:** Development Admin authenticated E2E NO-GO; Production NO-GO.
