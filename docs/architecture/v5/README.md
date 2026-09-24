# MENAFoods Architecture v5 — GitHub Ready

This package is intended to be merged into the existing **Zoho Middleware Connect** repository.

## Target architecture
- Zoho Creator: operational cache, workflows, approvals
- Zoho Books: accounting authority
- Zoho Inventory: stock/fulfillment authority
- Zoho Catalyst: shared API gateway + primary production frontend
- Replit: secondary/dev/preview frontend only
- GitHub: source control

## Merge order
1. Copy `docs/architecture/v5/`
2. Add shared API helpers from `src/api/`
3. Point Catalyst frontend and Replit frontend to the shared client in `src/frontend/shared/`
4. Remove any duplicated business persistence/rules from Replit
5. Add real Zoho adapter implementations behind the placeholder `ctx.*` interfaces
6. Run E2E tests before enabling credit enforcement

## Important
The included JS is a scaffold, not a drop-in replacement for unknown existing project files.
Merge it around the existing repository structure rather than overwriting working code blindly.
