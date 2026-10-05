# Catalyst Development integration handoff — existing runtime only

Checked: 2026-10-05. No production changes or Replit usage.

## Verified target
- Catalyst organization: Kolathur (org ID 809407193)
- Project: menafoodscustomermiddleware (17990000000237407)
- Environment: Development (17990000000237424)
- Existing Node 24 gateway: mf_zoho_gateway (function ID 17990000000231926)
- Existing gateway routes: MFAPI, MFUser, MFShop, mf_zoho_gateway, MFReplit (all target the gateway function).
- Existing hosted client routes: Login Redirect and MENAFoods Customer Web.
- No Catalyst deployment pipeline was listed by the connector.
- The connector allows reading the deployed function metadata and editing limited runtime settings, but does NOT expose ZIP/source-code upload for this function. Do not attempt to update function stack/memory as a substitute for a code deployment.

## Reuse and merge policy
- Do not recreate backend, business datastore, route mappings, or duplicate Books order writer.
- Merge Core P0 handlers into the *actual private existing gateway source* locally/in a restricted repository, **not** into a new Catalyst function.
- Public GitHub branch catalyst-core-p0 remains source scaffolding and tests, not a complete deployed function.
- Replit is paused.
- Keep MF_CREDIT_ENFORCEMENT_MODE=OBSERVE until reconciliation and E2E completion.

## Security block before release
The Catalyst connector's GET project/function metadata surfaced authentication signing secrets and runtime secret environment variables in API responses. Never copy them into public GitHub files or logs. Rotate affected credentials and update dependent clients/webhooks, planning for session invalidation before release. Restrict metadata visibility/permissions if possible.

## Existing staged source packages
The Oct 4 Batch 1 audit references a staged gateway ZIP derived from the v12.3.8 source and staged hosted-client ZIP. Neither archive is proven deployed. Confirm original private archives and hashes before use; preserve existing OAuth and OTP configuration. Do not upload sources to this public repository.

## Existing source integration checklist
1. Back up the existing Development function and web client.
2. Compare gateway private source with v5 Core P0: use the real auth/session and existing order writer.
3. Preserve ACTIVE membership checks and business/user-scoped cart and order history.
4. Reject all unauthenticated bootstrap requests, verify profile and permitted tenant role.
5. Implement durable **datastore-enforced atomic** idempotency keyed by tenant+business+operation+external id; the public code is only an adapter contract.
6. On ambiguous external-write failure, retain reconciliation state; look up Books by stable reference before any retry.
7. Confirm webhook authentication/signature verification before accepting Books/Inventory notifications. Current source scaffold does not prove ingress authentication.
8. Prove Creator pricing, CTN/PCS conversion, stock, Saudi VAT, credit mode, and exactly one Books sales order.
9. Test two independent Catalyst identities/businesses for cross-tenant isolation, including logout, business switch, carts, purchase-cost privacy and order history.
10. Execute core unit tests plus authenticated E2E tests in Development, then stage and deploy existing function/client packages with the authorized Catalyst CLI/console.
11. Confirm Development health endpoint, browser login, SO sync and rollback readiness. Do not merge to main or deploy Production until gates pass.

## Current blocker
No available connected action accepts a source ZIP or updates the deployed function code. Function metadata and API route inspection succeeded; **code deployment has not occurred**. Complete the secure CLI/console source upload handoff or connect a deployment-capable tool before declaring Catalyst integration done.
