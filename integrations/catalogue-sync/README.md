# MENAFoods catalogue sync core (Development-only reference implementation)

This module is **not a deployed service**. It must be integrated into the **existing** Catalyst `mf_zoho_gateway`; do not create a second backend. Source code for that gateway was **not** present in the currently accessible GitHub `menafoods` or `menafoods-client` default branches, so this pull request intentionally does not pretend to deploy webhooks, modify Zoho Creator schema, or edit the live frontend.

## What is implemented
- Strict stable-ID matching (no fuzzy match by name), per-tenant isolation required at authentication boundary
- Authorized-field validation, **verified purchase bill only** for cost changes
- Durable idempotent transaction/outbox contract with single product revision and three fan-out targets
- Webhook HMAC verifier; caller must enforce timestamp replay window and source auth scopes
- Strict **public-only** catalogue serializer: excludes supplier cost, margin, buyer balances and vendor data
- Product images only publish if media is approved AND rights are confirmed

## Runtime integration steps
1. Recover deployed `mf_zoho_gateway` source in Catalyst Development. Audit existing `/mobile/catalog/products` and `/mf-api/products` response contracts.
2. Map Creator `Products_Form` IDs and fields: `ZB_Item_ID`, `Storefront_ProductID`, `Product_Name`, `Translated_Name`, `Brand`, `SKU`, `Unit`, `Secondary_Unit`, `Selling_Price`, `Category`, `Product_Images`. Do not equate a Creator quantity rate with a customer-specific Zoho Books price list.
3. Implement injected transactional `store` against **existing** Catalyst Datastore: product identity registry, seen-event ledger, outbox, destination acknowledgements and dead-letter queue. Avoid unauthenticated public table permissions.
4. Implement authenticated source adapters for Creator, Books, Commerce and authorized Catalyst Admin; all writes must retain `rootEventId` for loop suppression. On destination success, save destination ID and ACK. Retry 429/5xx with exponential backoff, not unlimited retries.
5. Fix Creator supplier On Edit success workflow error **Invalid email address** (observed 2026-10-24) before trusting notifications. Never send empty email.
6. Add Creator schema fields through Zoho Creator admin/change-management: `Canonical_Product_ID`, `Sync_Revision`, `GTIN`, `Units_Per_Carton`, `Net_Weight_kg`, `Image_Source`, `Image_License`, `Image_Approval_Status`, `Last_Sync_Status`, `Last_Sync_Origin`, `Last_Sync_At`. Creator connector can read/update records but cannot create these fields.
7. Define exact collision and field-precedence policies. Purchase costs from validated Books Bills; customer price lists remain customer-specific; imagery and descriptions require content approval.
8. Reconcile all 2,122 Creator products against Books/Commerce/Catalyst IDs before backfill. Send absent IDs, repeated SKUs, uncertain descriptions and missing images to review; do not fabricate product information.
9. Test full lifecycle and rollback across all 4 systems, all 7 roles, Arabic RTL and Android before **Development-only** deployment, not Production.

## Checks
`node --test integrations/catalogue-sync/catalog-sync-core.test.mjs`

No credentials, client data, source invoices, customer financials or passwords are stored in this repository. Related issue: #36.
