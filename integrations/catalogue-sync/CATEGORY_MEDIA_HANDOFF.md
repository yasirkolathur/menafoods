# MENAFoods category + subcategory image workflow — DEVELOPMENT ONLY

## Verified existing records (2 Nov 2026)

- Zoho Creator owner `menafoods`, app `mena`: **16** categories in `All_Categories1` (`Add_Categories.Image`) and **146** collections/subcategories in `All_Collections` (`Collections.Image`).
- **12 collection Image fields are blank**. The 16 top-level category rows contain older image files; do not overwrite them without review.
- Existing Catalyst project `menafoodscustomermiddleware`, gateway `mf_zoho_gateway`; `MF_Product_Sync_Registry` and `MF_Product_Sync_Outbox` exist for **products**. General category/collection media schema and deployed media processor **not confirmed**. Do not insert category jobs into product-only tables without explicit migration and readback.
- Existing [draft product sync PR #37](https://github.com/yasirkolathur/menafoods/pull/37) is unmerged and must remain gated. [Issue #36](https://github.com/yasirkolathur/menafoods/issues/36) owns cross-system scope.

## Correct future workflow (not yet wired or deployed)

1. **Creator → Catalyst:** operator updates a category (`All_Categories1`) or subcategory (`All_Collections`). Existing authenticated gateway receives a signed event including the **exact Creator ID**, kind `category|collection`, parent Creator category ID for collections, source revision, origin and immutable event ID. Gateway uses Zoho OAuth and **authenticated download of the existing Creator image field** (one file per download).
2. Validate media: content type JPEG/PNG/WebP, 320–4096 px, <=5MB; actual byte count and SHA-256; declared image provenance and usage rights; mark AI generated pictures as `illustrative`. Route unverified image to **review**, not storefront.
3. Approved media is stored in existing Catalyst **Stratus** under `catalogue-media/{kind}/{creator-id}/{sha256}.{ext}`. Add approved media metadata to the **same existing sync registry and outbox architecture** after migration supporting category/collection. Use unique idempotency key, root event ID, tenant ID, revision compare-and-swap.
4. ACK only after downloading Stratus object again and checking exact checksum, record ID, entity kind and revision. Retry 429/5xx with exponential backoff (5 attempts → dead letter); never echo auth credentials or use fuzzy name matching.
5. **Catalyst → Creator:** an **authorized admin** uploads an approved image to the *same* existing Creator ID using Creator REST v2.1 `POST /creator/v2.1/data/menafoods/mena/report/{All_Categories1|All_Collections}/{recordId}/Image/upload`, with multipart key `file` and current server-side OAuth token. Verify Creator record and image downloaded byte-for-byte. Do not create new category/collection records.
6. Prevent loops using `rootEventId`, `sha256`, current revision and origin stamping. No changes to customer-specific prices, supplier costs or stock. Catalyst's storefront media response must use only approved image fields and fallback to currently approved older images if any new upload fails.
7. **Commerce/catalogue refresh** only after image readback and current native integration verified. Clear cache deterministically after approval and verify mobile/Android and EN/AR RTL layout. Do not claim current storefront published solely from Creator flag `Yes`.

## Critical gate

- Recover the actual deployed gateway code hash and currently running API contract before wiring into it: old source cannot be replaced with this draft.
- Add auth and rate limits, HMAC/timestamp replay validation in the existing route handler. `sourceAuthenticated` / `adminAuthorized` flags in the staged module MUST be supplied **only by server-authenticated code**, not trusted from client payloads.
- Confirm Creator OAuth scope `ZohoCreator.report.CREATE` and upload/download behavior in Development.
- Migrate the existing product-only datastore schema safely before enabling category/collection writes. No separate backend, no new publicly writable table.
- For media generated in ChatGPT, obtain visual/content approval before marking `approved`. Sample assets may be generic illustrations and should not imply branded product specificity.
- Execute 2-way create/change/replay/conflict and no-duplicate tests with verified destination receipts. Deploy **Development only after acceptance**. Never publish Production or overwrite existing customer data without evidence.

## Asset pack

Generated locally on 2 Nov 2026: **16 category images + 12 missing subcategory placeholder illustrations**, 768×768 WebP, plus `manifest.json` containing exact Creator IDs, parent IDs, SHA-256, artwork provenance and `review_status=proposed`. **Not uploaded to Creator, Stratus or Commerce.** Images are illustrative until content approval; do not treat as photographs of actual stock.

## Source API documentation

- [Creator Upload File API v2.1](https://www.zoho.com/creator/help/api/v2.1/upload-file.html)
- [Creator Download File API v2.1](https://www.zoho.com/creator/help/api/v2.1/download-file.html)

Tests: `node --test integrations/catalogue-sync/catalogue-media-sync.test.cjs`

This PR is an **isolated source-only extension of PR #37**, not a second system.