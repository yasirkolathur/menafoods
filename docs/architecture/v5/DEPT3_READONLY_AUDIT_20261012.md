# Department 3 — read-only integration audit and authorized COD pilot gate

**Verified on:** 2026-10-12 (Asia/Riyadh). **Issue:** #27. **Status:** NO-GO for live pilot until blockers below are closed.

## Existing architecture, no new backend

- Connected Creator owner/app: `menafoods/mena`, enabled. Canonical Sales Order form is `Sales_Order_ZBooks`, exposed by `Sales_Order1_Report`. Legacy `Sales_Order` and `Orders` are separate; `Orders.Sales_Order` still looks up the legacy form.
- Existing Catalyst Development project: `menafoodscustomermiddleware`, project ID `17990000000237407`; Advanced I/O gateway function `mf_zoho_gateway` (ID `17990000000231926`). API routes `mf_zoho_gateway`, `MFAPI`, `MFShop`, `MFUser` and older `MFReplit` alias all target the same function. **Do not create or deploy a second gateway.**
- Catalyst function connector reports `is_deployed:false`; direct GET execution reports **Only BasicIO Execution is supported**; remote Development health URL was inaccessible from this audit environment. This does not prove the runtime is offline. Obtain authenticated Catalyst CLI build/deployment receipt and direct HTTP smoke before claiming any live integration.
- The existing configuration identifies the Zoho Books/Inventory org and default warehouse; warehouse existence, accessible Inventory permissions, tax IDs and item stock have **not** been confirmed by a successful Inventory read.
- `MF_CREDIT_ENFORCEMENT_MODE=OBSERVE`: do not allow CREDIT checkout. The separate `MF_CHECKOUT_PILOT_MODE` setting must be reviewed against the actual gateway runtime, not assumed to imply authorization.
- DO NOT copy OAuth client secrets, tokens, session secrets, admin API keys or webhook secrets into GitHub issues, screenshots or test fixtures.

## Creator read-only audit (report pagination limited to first 200 where noted)

| Dataset | Read-only evidence |
|---|---|
| `All_Products` first 200 | 16 missing `ZB_Item_ID`; 27 missing `Unit`; 33 empty `Product_Images` subform; 107 `Storefront=Yes`; category and supplier lookup present in these rows |
| `All_Categories1` entire 16 | 16 have Books IDs, category image and translated name fields populated |
| `All_Suppliers` entire 172 | 1 missing `ZBooks_ID` |
| `Supplier_Product_Pricing_SF_Report` first 200 | 86 default `Yes`; 114 `No`; no supplier lookup or supplier price missing in sample |
| `All_Customer_Price_Lists` first 200 | 199 have `Custom_Price`; pricing data exists, but session/tenant isolation is unverified |
| `Customer_Types_and_Offers_Report` entire 31 | 18 missing `ZBooks_PriceList_ID` |
| `Sales_Order1_Report` first 200 | 200 have `SO_ZBooks_ID`; shows historical links, **not** a validated exactly-once checkout |
| `Product_Images` first 200 | 95 empty in both image fields returned by that report; confirm active storefront items and alternate image sources |

**Projection caveat:** The `All_Products` report and record-by-ID view did **not** return `Secondary_Unit`, `Package_Details` or `Product_Image` even though those fields exist in the Creator form metadata. Do not mark these values missing without a full-field endpoint or actual gateway response.

Creator `Products_Form` includes `Category`, `Collection1`, `Unit`, `Secondary_Unit`, selling price, margin, supplier, image subform, `ZB_Item_ID` and storefront toggle. Its metadata contains no dedicated carton-to-piece conversion quantity field. The authoritative conversion requires the existing Catalyst `MF_Product_Unit_Rules` or actual Inventory unit group mapping, verified per SKU.


### Expanded read-only sample (12 Oct 2026)

- `All_Products`, first **1,400** rows: 203 missing Books item IDs, 325 missing primary unit, 139 empty `Product_Images` subform; 705 marked `Storefront=Yes`. Among those 705 storefront rows: **0** missing Books item ID, **8** missing `Unit`, **9** with an empty image subform. These figures are sampled, **not catalog-wide totals**. Other image fields were not returned by the report, so an empty subform is not proof the product has no usable image.
- `Sales_Order1_Report`, first **1,200** rows: all 1,200 have nonempty `SO_ZBooks_ID` and distinct Creator `ID`. But **87 different Books Sales Order IDs are referenced by multiple Creator records**, accounting for 89 excess Creator-to-Books links (highest observed multiplicity 3). This does **not** establish duplicate Books Sales Orders; it is an observable historical Creator mapping collision. Preserve records, reconcile against actual Books IDs and origin workflows, and do not auto-merge/delete.
- Because the Canonical Creator mapping is not currently one-to-one across this sample, the pilot must fail closed unless the target checkout reference can be resolved to exactly one verified Creator record. Review legacy writers before enabling new writes.

## Catalyst datastore read-only audit

- `MF_Idempotency_Records`: unique `UNIQUE_KEY`, `IDEMPOTENCY_KEY`, `REQUEST_HASH`, `STATUS`. Initial Development query returned zero rows.
- `MF_Order_Queue`: unique `ORDER_REF`, `ZOHO_SALESORDER_ID`, status/retry/tax fields. Initial Development query returned zero rows.
- `MF_Product_Unit_Rules`: one row returned, with secondary unit enabled, nonempty Books item ID and positive conversion; **not** comprehensive catalog coverage.
- `MF_Product_Category_Map`: initial query returned zero rows.
- These are structural checks, not atomic claim/commit, Books order posting, tax or stock correctness proofs.

## Inventory OAuth: safest path to unblock

1. Confirm correct Inventory organization and data-center endpoint from the existing Catalyst function configuration (do not assume a VAT number is an org ID).
2. In the **existing** Zoho OAuth client / connection, request or reauthorize read scopes `ZohoInventory.items.READ` and `ZohoInventory.warehouses.READ` (official documentation). Existing refresh tokens cannot be assumed to acquire a newly added scope automatically. Retain only the scopes actually needed by that operation.
3. Via the existing gateway in Catalyst Development, call Inventory `GET /inventory/v1/items?organization_id=<verified-org-id>` and `GET /inventory/v1/warehouses?organization_id=<verified-org-id>` with server-side OAuth; capture status, Zoho response `code`, correlation ID and count, **never tokens**.
4. If 401/code 57 recurs, inspect OAuth grant/user roles, data center/organization access and missing scope; re-consent and retest. Do not bypass or fabricate stock.
5. For a pilot SKU, verify warehouse ID, location-specific available quantity, Books item ID and unit group conversion. A configured ID alone is not proof.

Official sources:
- https://www.zoho.com/inventory/api/v1/items/
- https://www.zoho.com/inventory/api/v1/multi-warehouse/
- https://www.zoho.com/inventory/api/v1/oauth/

## Required single-writer order lifecycle

- The **only** Books Sales Order POST writer is the existing Catalyst gateway. Creator and Commerce automation may only receive/reflect that checkout, not independently POST another Books SO.
- After server-side authenticated pricing, warehouse, product tax and COD/prepaid approval, atomically claim immutable org/customer/server-cart reference in `MF_Idempotency_Records`. Use stable Books `reference_number`, and reconcile any existing Books SO by **both customer and reference**.
- POST Books SO **at most once**. If response is missing/unknown, hold claim for reconciliation; never replay automatically.
- Within the same claimed operation, reconcile exactly one record in canonical Creator `Sales_Order_ZBooks` by actual `SO_ZBooks_ID`. The production callback must use the existing Creator report, create only if absent under the sole authorized writer, re-read, reject duplicate count, and return verified Creator ID. Legacy `Sales_Order` is never substituted.
- Complete the durable claim and queue only with a verified Books ID **and** verified canonical Creator ID. If Creator reconciliation fails *after* a Books POST, hold the claim and reconcile manually; do not repeat Books POST.
- Only safe COD or independently verified PREPAID permitted in pilot; CREDIT blocked while OBSERVE. No invoice, bill, payment receipt or stock adjustment auto-created.

## Next verification / release gate

1. Reconcile the source in this draft GitHub branch with the **deployed** `mf_zoho_gateway` function before merging/deploying. This branch itself is source only.
2. Run `npm run check && npm test` on a trusted CI/runner and collect the workflow result; review newly added COD/Creator-link tests.
3. Confirm no duplicate Books writer automation in Creator, Commerce and old checkout route.
4. Read-only proof: two different authenticated test customers see their own prices and only their orders, correct B2B images, supplier mapping, CTN/PCS conversion, actual stock and verified Books tax ID for a taxable 15% item.
5. Obtain explicit owner approval for **one** low-value Development COD order, capture masked Creator ID, Books SO ID, immutable checkout reference, queue record and single idempotency claim. Verify line units/price/tax/stock and replay/double-tap/timeout without duplicates.
6. Stop immediately on permission 401, tax mismatch, unknown inventory, missing item IDs, cross-customer leakage, duplicate Creator record, or unknown Books outcome.

**No live financial writes, schema mutations, OAuth grant changes, gateway deploy, or stock modifications were performed for this audit.**


## 12 Oct — follow-on integrity analysis and source-only guards

### Extended canonical Creator sample

- `Sales_Order1_Report`: **2,400** distinct Creator IDs inspected across 12 pages; **1** blank Books SO mapping; **164** distinct Books Sales Order IDs referenced by multiple Creator rows; **167** excess mappings (161 pairs, 3 triplets). One duplicate group has **different Books customer IDs**; none of the 164 groups has multiple distinct `SO_Number` values in returned data. These are cursor-sample aggregates, not proof of duplicate Books financial documents.
- **STOP:** do not repair these by deleting or merging existing Creator records. First compare actual Books document, `SO_Number`, Creator `ID`, Books customer mapping, and workflow source; isolate the single cross-customer conflict with authorized internal-only tools. Avoid exposing customer names/IDs in public GitHub.
- Snapshot/summary code in `src/api/lib/creator-so-integrity.js` accepts Creator records only after complete authorized report lookup and asserts exactly one record with matching `SO_ZBooks_ID`, `Customer_ZBooks_ID` and `Customer_Form`. It returns sanitized summary counts for duplicate diagnosis.

### Inventory read proof (source only; **not OAuth repaired**)

- Official scopes: `ZohoInventory.items.READ` for item detail/list, `ZohoInventory.warehouses.READ` for warehouse listing. The optional organizations-list endpoint uses `ZohoInventory.settings.READ`; do not add it unless the existing account actually needs to list organizations.
- New `src/api/lib/inventory-read-proof.js` validates code-0 read responses; rejects HTTP 401/403 and Zoho code 57; exact active warehouse and active tracked item ID; location-specific `location_available_stock` (or explicitly supplied `warehouse_available_stock`), zero stock as zero, unknown blank stock as failure, stale snapshot as failure. It emits no purchase/supplier costs.
- It deliberately refuses fractional/weight-based inventory in the CTN/PCS proof: a separate properly unit-aware KG adapter is required. Never infer a particular warehouse's available stock from aggregate `item.stock_on_hand`.
- The currently available Catalyst function-execution connector supports Basic I/O only; `mf_zoho_gateway` is Advanced I/O. Thus these guards are **not** evidence of an authenticated live Inventory read. Only the existing gateway can integrate the helper after recovered source review.

### New tests and integration boundary

- `test/inventory-read-proof.test.js`: missing scope/authorization, negative and absent stock, wrong warehouse, zero stock and stale data.
- `test/creator-so-integrity.test.js`: missing/multiple Creator records, incomplete lookup, cross-customer mismatch, aggregate collision count.
- Pilot callback now requires raw verified canonical Creator lookup records with explicit `searchComplete:true`, rather than trusting a bare callback-supplied `mappingCount:1`. The gateway must query and exhaust relevant Creator pages after optional authorized upsert and return only the exact `Sales_Order_ZBooks` records. **A configured callback that returns fabricated rows is not authorization.**
- Keep all changes in draft PR #31 stacked on draft PR #23. No Catalyst source merge, OAuth re-consent, financial write or production deployment in this task.

Sources: https://www.zoho.com/inventory/api/v1/items/ ; https://www.zoho.com/inventory/api/v1/multi-warehouse/ ; https://www.zoho.com/inventory/api/v1/organizations/ .
