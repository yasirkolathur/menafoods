# MENAFoods • Creator Unified UI — Figma handoff

**Figma project:** https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=143-2

**Status:** 12 editable Figma designs completed, previews visually checked. These **are not installed in Zoho Creator and do not prove live connection**. Do not mark UI live, bill posting active, or existing buttons connected without testing.

## Same theme as user-supplied Seller dashboard screenshot
- Charcoal header and floating bottom navigation (`#2D2D2D`, `#1D1D1D`)
- Off-white canvas `#F5F6F8`, white cards `#FFFFFF`, 17–18px card radius
- MENAFoods green primary actions `#087748`, orange selection outline `#D96034`
- Inter English + Cairo Arabic; mobile frame 390×844; 44px minimum controls
- Sticky Save Draft / Review for lengthy bill & PO forms, genuine RTL mirroring
- Tokens already stored in the existing Figma file in variable collection `MF Creator / Theme Additions`.
- CSS/role UI handoff: `zoho/seller/creator-theme.css`. Scope styles to `.mf-creator-ui`; do not globally override Creator/Zoho CSS.

## Screens and existing-app integration routes

| Figma node | Editable Figma screen | Existing Creator target / implementation |
|---|---|---|
| [144-2](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=144-2) | Seller • Dashboard | `MENA_Dashboard` / Seller tab; preserve existing PO and activity data |
| [144-53](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=144-53) | Seller • Manual Purchase Order | Existing `Purchase_Order` form |
| [144-114](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=144-114) | Seller • Manual Supplier Bill | Existing `Bill_Books` form, after adding fields and approval workflow |
| [144-179](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=144-179) | Seller • Catalog & Pricing | Existing `Products_Form` and supplier pricing report |
| [145-48](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-48) | Sales • Dashboard | Existing `Sales_Dashboard` and `Sales_Order_ZBooks` |
| [145-134](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-134) | Delivery • Route Board | Existing Delivery role workflow; confirm actual route before wiring |
| [145-220](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-220) | Admin • Control Center | Existing approvals, operations, books controls; confirm access |
| [145-306](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-306) | Storekeeper • Pick & Pack | Existing picking/discrepancy role flow |
| [145-392](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-392) | Accountant • Payables | **Restrict** to Accountant/Admin/Owner; never show to Seller/Customer |
| [145-481](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-481) | Customer • Wholesale Store | Existing commerce storefront and customer prices |
| [145-572](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-572) | Seller • Arabic RTL | Same canonical Seller workflows, direction and font changed |
| [145-655](https://www.figma.com/design/xjvwwbPgKN28bNgAu9EZuu/MENAFoods?node-id=145-655) | Sales + Delivery • Shift | Only users assigned both role grants |

**Data is illustrative** unless it comes from a verified accounting record. Figma is not a live connector. The Accountant screen displays the four 03-Oct receipt amounts as awaiting verification, not as posted bills.

## Deployment checklist

1. In the existing Creator app, inspect page builder for `MENA_Dashboard` and identify which role tabs share it.
2. Add responsive CSS via supported Creator page mechanism; do not edit the Catalyst gateway or create a second backend.
3. Match headings, cards, status chips, typography, panels, nav and touch targets to the Figma frames.
4. Manual PO button opens existing `Purchase_Order`; Bill button opens existing `Bill_Books` **only after capture fields are added**; neither button posts automatically.
5. Keep current navigation and role access. Finance/Accountant not accessible to Seller or Customer.
6. Verify Arabic RTL, 390×844 mobile and desktop widths, scrollable forms with sticky actions and safe-area insets.
7. Test actual database lookup, supplier invoice uniqueness, Books IDs, stock, credit, role checks and success/error behavior before marking the screen functional.
8. Keep this PR as **draft** until installed and verified in live app (Creator environment is not enabled according to connected API).

No Replit or TinyFish required.
