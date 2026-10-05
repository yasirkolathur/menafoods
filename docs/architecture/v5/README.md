# MENAFoods Architecture v5 — Catalyst First

## Target architecture
- Zoho Creator: operational cache, workflows, approvals
- Zoho Books: accounting authority
- Zoho Inventory: stock/fulfillment authority
- Zoho Catalyst project `17990000000237407` (`menafoodscustomermiddleware`): shared API gateway + primary backend/runtime + production frontend
- GitHub: source control and CI
- Replit: not part of the active runtime or deployment path

## Merge order
1. Preserve working auth/session and Zoho adapters.
2. Consolidate one `/mf-api` contract.
3. Keep Catalyst as the only backend/runtime.
4. Add real Zoho adapter implementations behind the placeholder `ctx.*` interfaces.
5. Run E2E tests before enabling credit enforcement.

## Safety
The JS in this branch is an architecture scaffold. Merge around existing production code; do not overwrite stable Catalyst functions blindly.
