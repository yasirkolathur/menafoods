---
name: architecture-guardrails
description: Use when planning or changing MENAFoods architecture, services, integrations, storage or authentication.
---
# MENAFoods architecture guardrails
1. One backend: Zoho Catalyst menafoodscustomermiddleware.
2. GitHub is source of truth; Replit may assist frontend/dev only.
3. Reuse Zoho Books, Inventory, Commerce and SalesIQ; no duplicate WABA/auth/accounting stacks.
4. Inspect before creating tables, routes or services.
5. Put permissions and business rules on the server.
6. Every external write needs idempotency, auditability, explicit failure state and safe retry.
7. Prefer incremental migrations and backward-compatible API changes.
8. Document changed contracts and rollback steps.