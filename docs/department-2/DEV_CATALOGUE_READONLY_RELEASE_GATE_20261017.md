# MENAFoods — Development public catalogue release gate (17 October 2026)

Target: **only** existing Catalyst `menafoodscustomermiddleware` Development, gateway `mf_zoho_gateway`. No private source, customer data, secrets or additional backend is included.

## Independent live read-only evidence (17 October 2026, Saudi time)

Using three **anonymous GET** queries on the existing `/mf-api/mobile/catalog/products` endpoint, with `per_page=20`, we observed:

| Page | Rows | Hidden storefront rows | `has_more_page` |
| --- | ---: | ---: | --- |
| 1 | 4 | 1 (explicit `show_in_storefront=false`) | true |
| 2 | 0 | 0 | true |
| 3 | 0 | 0 | true |

There were **no observed supplier-cost fields** in those sampled rows. The response reported `data_source=ZOHO_COMMERCE_LIVE` and `sample_data_used=false`.

**P0:** server output includes a non-storefront product, even if the frontend hides it later. **P0:** an empty page still claims more pages, which can cause incomplete/infinite pagination. These observations do **not** establish whether every product detail endpoint is protected, and they do not prove an authenticated exploit.

## Added release verification (non-mutating)

`scripts/dev-catalogue-contract.mjs` audits bounded (default 3 pages / 20 products per request, max 10 pages) **anonymous GET** responses at the exact approved Development hostname. It checks:
- `show_in_storefront=false`, `can_process_in_storefront=false`, inactive/archived/deleted/draft and hidden variants;
- nested or top-level purchase-cost, supplier/vendor fields;
- wrong pagination page index, empty page with `has_more_page=true`, provider-marked partial pages and cross-page repeats;
- malformed API responses or transport failures fail closed.

Output contains only page numbers, counts, and problem labels — no product IDs, item names or record bodies.

Commands:
- Offline deterministic: `node --test test/dev-catalogue-contract.test.js` (13 independent subtests)
- Controlled live read-only audit: `node scripts/dev-catalogue-contract.mjs`
- GitHub Actions: run **Development Catalogue Readonly Audit** via workflow_dispatch. It will report a **red** job while these provider-facing issues persist, which is deliberate.

## Backend remediation target (not implemented in this test-only PR)

Use only the existing authoritative **private** Catalyst gateway source, recover/diff it and keep rollback evidence. Before serialization, filter disabled/non-storefront products and variants, enforce the same rule on direct item detail routes, and handle upstream empty/repeated/mismatched pages with bounded stopping and explicit `partial_catalogue` status. Do not copy private gateway implementation or provider secrets to this public repo. Coordinate with existing private staged gateway candidate v12.3.26-dept2.4; do not blindly replace it.

**Release gate:** real catalog audit green **plus** authenticated customer/branch isolation and canonical order E2E. No deployment or financial writes authorized by this audit alone.
