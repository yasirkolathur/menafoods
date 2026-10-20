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

`scripts/dev-catalogue-contract.mjs` audits bounded (default 25 pages / 100 products per request, maximum 25 pages) **anonymous GET** responses at the exact approved Development hostname. It checks:
- `show_in_storefront=false`, `can_process_in_storefront=false`, inactive/archived/deleted/draft and hidden variants;
- nested or top-level purchase-cost, supplier/vendor fields;
- wrong pagination page index, empty page with `has_more_page=true`, provider-marked partial pages, intra-page and cross-page repeats, absent product IDs, and a scan stopping before the final page;
- missing, invalid or inconsistent `total_count`, or actual unique count differing from the reported total;
- malformed API responses or transport failures fail closed.

Output contains only page numbers, counts, and problem labels — no product IDs, item names or record bodies.

Commands:
- Offline deterministic: `node --test test/dev-catalogue-contract.test.js` (23 independent subtests)
- Controlled live read-only audit: `node scripts/dev-catalogue-contract.mjs`
- GitHub Actions: run **Development Catalogue Readonly Audit** via workflow_dispatch. It will report a **red** job while these provider-facing issues persist, which is deliberate.

## Backend remediation target (not implemented in this test-only PR)

Use only the existing authoritative **private** Catalyst gateway source, recover/diff it and keep rollback evidence. Before serialization, filter disabled/non-storefront products and variants, enforce the same rule on direct item detail routes, and handle upstream empty/repeated/mismatched pages with bounded stopping and explicit `partial_catalogue` status. Do not copy private gateway implementation or provider secrets to this public repo. Coordinate with existing private staged gateway candidate v12.3.26-dept2.4; do not blindly replace it.

**Release gate:** real catalog audit green **plus** authenticated customer/branch isolation and canonical order E2E. No deployment or financial writes authorized by this audit alone.

## 20 October 2026 — Development release update and revalidation

**Previous deployment claim, separately attributed:** Grok posted that the existing gateway was deployed as **v12.3.27** in Development and now serves **1,272** visible products, with no hidden items, clean pagination and hidden-item 404. This is a reported deployment receipt, **not** an independent complete scan from this audit.

**Independent checks performed 20 Oct:**
- Public `/mf-api/health` returned `ok=true`, version **12.3.27**.
- Public `/app/client-package.json` served a **12.5.21-grok-qa** version label, but its description still says "LOCAL ONLY (not deployed)"; this label alone does not prove actual feature/role E2E tests passed. Catalyst web app metadata modified 20 Oct at 07:26 (reported local time).
- Independent anonymous `/mf-api/mobile/catalog/products?page=1&per_page=100` and final-page GETs returned **HTTP 429** via external fetch, preventing a full scan. This is a **coverage block** (not proof of duplicate IDs or hidden products).
- GitHub Actions broad Development smoke at commit `4d780a9ff093230ba7c3e005c54467dddde9d78a` returned **503** from `/mf-api/mobile/status` and **429** from `/mf-api/mobile/catalog/products?page=1&per_page=1`; the two legacy Core P0 workflows correctly failed. Their failures are **not** caused by a deterministic unit-test failure.
- This PR's revised **Development Catalogue Readonly Audit** (run `39371282050`) passed its **21/21 offline deterministic checks** on Node 24, including a simulated 13-page/1,272-product final-page count, duplicate IDs, inconsistent totals, cap exhaustion and 429 rejection. The live-audit job was intentionally **skipped** until manually dispatched; this is not proof that the real 1,272 products were all checked.

**Release gate correction:** The old three-page checker was insufficient to certify 1,272 records. It now has a 25-page cap and compares reported `total_count` to actual unique products at the final page. It also refuses to pass a scan that reaches its cap with `has_more_page=true`.

**Required next investigation:** Identify whether 429 is an application throttler, platform rate limit, WAF, shared-IP limit or upstream Commerce provider response. Check sanitized request IDs, permitted request rate and any Retry-After; do not bypass or raise customer-facing limits without security review. Independently verify `/mobile/status` 503 and upstream health. Once read-only GETs are stable, run the manual audited complete scan (up to 25 pages, rate-aware) and a separately authorized hidden-detail 404 probe. Validate customer-specific pricing/stock and exactly-one COD Books+Creator order only after authenticated gates pass.

**No Production changes, customer data writes, secrets, merge or function deployment were made by this checker work.** 

**20 Oct follow-up guardrails:** Manual live audit now waits **750 ms between consecutive page GETs** (bounded to 5 seconds via option), never retries a 429 automatically, and inspects nested public DTO metadata/arrays for private supplier/cost keys. The deterministic CI adds coverage for both behavior changes. These source-only checks do not fix the server's actual 429/503 responses and must not be treated as a passed full-catalogue live scan.
