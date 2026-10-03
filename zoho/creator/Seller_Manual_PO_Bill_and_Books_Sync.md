# MENAFoods — Seller manual PO / Bill + Zoho Books posting workflow

**Status: source prepared, NOT installed/deployed in Creator or Zoho Books.** This repository currently has no Seller UI source or authenticated Zoho Creator workflow-editor action exposed, so this change is an implementation package for the *existing* MENAFoods Mena Creator app. Do not create a second backend.

## Existing app, confirmed live 2026-10-03

- App: `menafoods/mena`; Zoho Creator form `Purchase_Order` already supports manual PO entry (Supplier + Products subform).
- The canonical Books bill sync form is `Bill_Books`. At present it has **only** `Books_Bill_Id` and `Updated`, therefore it cannot be used to input an invoice until the fields below are added.
- `Bill` is an older separate form. Do **not** route Seller's Manual Bill button to `Bill`.
- `Supplier_Form` supplies the existing vendor mapping `ZBooks_ID`; `Products_Form` supplies the existing item mapping `ZB_Item_ID`.
- The app already has `All_Purchase_Orders`, `All_Bills_Books` and `All_Workflow_Routers` reports.
- Preserve the separate identifiers: `ID` (Creator record), `Books_Bill_Id` (Books internal record ID), `Bill_No` (supplier's printed invoice number), `Books_Bill_Number` (Books' unique bill number), and `ZB_Bill_ID` on linked PO if applicable.

## One-time changes in *existing* Creator app editor

Extend **Bill_Books**, retaining its two existing fields intact. Do not rename/delete any existing fields. Add:

| link name | field type | purpose |
|---|---|---|
| `Supplier` | lookup to `Supplier_Form` | existing vendor |
| `Bill_No` | single line | **supplier** invoice number, never Books internal ID |
| `Books_Bill_Number` | single line | unique number for Books Bill; follow configured Books numbering series |
| `Bill_Date` | date | supplier invoice date |
| `Due_Date` | date | due date; default to bill date after user confirms payment terms |
| `Associated_PO` | lookup to `Purchase_Order` | optional PO relation, no duplicate PO creation |
| `Bill_Items` | subform | line items, schema below |
| `Expected_Total` | currency, SAR | invoice inclusive-of-VAT grand total |
| `Sync_Status` | dropdown | Draft / Pending Approval / Ready / Posted / Already In Books / Needs Review / Failed |
| `Sync_Error` | multi-line | safe error description |
| `Receipt_Attachment` | file upload | supplier invoice scan, attachment sync is separate |
| `Approved_By` | user or single line | admin confirmation, must be set by approved workflow, not client text |

Each `Bill_Items` subform row:

| link name | field type | purpose |
|---|---|---|
| `Product` | lookup to `Products_Form` | match existing catalog item, not free text |
| `Quantity` | decimal | quantity in selected **purchase** unit |
| `Rate` | currency SAR | ex-VAT rate per selected unit |
| `Tax_Id` | single line | verified 15% Books tax ID from organization |
| `Unit` | drop-down | ctn / tin / pcs / kg, etc (actual purchase unit) |
| `Conversion_Factor` | decimal | primary units per selected unit, e.g. 1 CTN=4 PCS |
| `Line_Notes` | multi-line | descriptions and exceptions |

**Important:** Validate `ZB_Item_ID`, `ZBooks_ID`, amount, VAT, unit conversion and date before posting. Prefer configured Books Units of Measure groups if supported; do not silently multiply carton purchases by the packet ratio. A purchase of **1 carton** stays 1 carton in Books unless Books' item purchase unit and conversion are explicitly verified.

## Seller buttons — existing UI, no duplicate app

Add two buttons in the existing Seller home/dashboard using Zoho Creator Page Builder (or wire to the equivalent screen in the existing mobile frontend):

- **Manual Purchase Order / إنشاء أمر شراء يدوي** -> Open Form `Purchase_Order`, popup.
- **Manual Bill / إدخال فاتورة مورد** -> Open Form `Bill_Books`, popup **only after it has been extended** as above.
- Show the buttons only to the Seller/Operations/Admin roles authorized for purchases; perform a **server-side** role check before Books posting (client-only button visibility is not authorization).
- Seller can create and edit Draft bills and POs. Owner/Admin/accountant approval required before bill POST. Do not mark paid automatically.
- PO -> Bill conversion must reference original `Purchase_Order.ZB_PO_ID` / existing `Associated_PO`; never create a second PO just to make a bill.
- On success, display Creator record ID, supplier Bill_No, actual Books Bill_Number and Books_Bill_Id.
- Links in live Creator app: `#Form:Purchase_Order?zc_LoadIn=dialog` and `#Form:Bill_Books?zc_LoadIn=dialog`. Configure native page button -> Open form -> Popup if using the Page Builder.

Creator button behavior: https://help.zoho.com/portal/en/kb/creator/developer-guide/pages/buttons/articles/add-a-button

## Books integration and safeguards

Use **existing authenticated Zoho Books connection** name, verify that it has ZohoBooks.bills.READ + CREATE + Books item/contact read scopes. Obtain actual Books org ID from existing authorized configuration (do not guess from a VAT number or item ID). Never hardcode OAuth tokens.

Install a server-side Creator custom function using `mf_post_bill_books.deluge` and have a **Ready/Approved** action call it with the `Bill_Books.ID`. Do not automatically post on every form edit. The code checks `Books_Bill_Id`, checks Books by supplier invoice reference + vendor ID, creates *only if no match exists*, then persists the returned Books ID back into `Bill_Books`.

Official references:
- https://www.zoho.com/books/api/v3/bills/
- https://www.zoho.com/deluge/help/books/create-record.html
- https://www.zoho.com/deluge/help/books/fetch-records.html

### Additional controls required before enabling production

1. **Lock** manual posting via server-side approver role; `Approved_By` must be determined by the authenticated Creator user, not submitted freely by Seller.
2. Enforce unique composite key **(Books vendor ID, supplier bill number)** with transactional or serialized guard. A Books READ check alone does not prevent simultaneous posts; use a durable lock/status gate and reconcile timeouts by lookup before retrying.
3. Avoid posting when supplier invoice number is blurry or missing, or when sum(quantity × ex-VAT rate + VAT) differs from invoice total.
4. Existing invoice images must be attached with the Creator Upload File API, followed by Books bill attachment endpoint. The current record API cannot write IMAGE/FILE_UPLOAD fields.
5. Do not conflate the current `Bill_Books.Updated` flag (existing sync semantics) with a new `Posted` status until its historical workflow is reviewed. Preserve that workflow and gate the new routine to avoid duplicated writes.

## Four 2026-10-03 receipts — awaiting confirmation, NOT posted

| Supplier | Invoice amount (SAR) | existing vendor Books ID | status |
|---|---:|---|---|
| Faizah mixed food items | 867.68 | 4886172000024006097 | verify the original invoice number and line items |
| Faizah sunflower oil 17L | 142.03 | 4886172000024006097 | verify original invoice number |
| Bin Hofan Trading | 1104.00 | 4886172000000766001 | verify supplier invoice number / product identity |
| Al Khayaliyah Trading | 58.65 | 4886172000000108446 | verify exact item and supplier invoice number |

Totals and product line details require source receipt reconciliation. Do **not** create Books bills simply from these totals. The Bill Books form's previous ID snapshots do not prove these invoices are posted.

## Acceptance checklist

- [ ] Changes installed in same Creator `mena` app in development, reviewed and deployed
- [ ] Seller page actually displays the two buttons (mobile + web)
- [ ] Draft PO is saved using **existing** `Purchase_Order` and verified (no duplicate)
- [ ] Draft supplier bill is saved using **existing extended** `Bill_Books`
- [ ] Admin approval controls enforced server-side
- [ ] Books duplicate search performed by (vendor_id, supplier Bill_No)
- [ ] One test bill posted with confirmed vendor/item/tax/date and verified in Books
- [ ] `Books_Bill_Id` written back with returned `bill_id`; `Bill_No` unchanged
- [ ] Existing PO association and image attachment tested
- [ ] Remaining bills posted one-by-one, no guessed information, no duplicates
