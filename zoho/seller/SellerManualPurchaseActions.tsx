import type { CSSProperties } from "react";

/**
 * Reusable Seller screen action row. Presentational only: use the SAME
 * existing app navigation and authentication. Do NOT start a second app or
 * introduce a second MENAFoods backend.
 *
 * Integration:
 *   onManualPO   -> existing Creator Purchase_Order form
 *   onManualBill -> existing Creator Bill_Books form AFTER capture fields and
 *                   approved posting workflow are installed.
 *
 * Authorization to CREATE/POST is enforced in Creator/Books server-side; this
 * component only hides actions in the UI.
 */
export type SellerManualPurchaseActionsProps = {
  canCreatePurchaseOrder: boolean;
  canCreateBillDraft: boolean;
  onManualPO: () => void;
  onManualBill: () => void;
  lang?: "en" | "ar";
  billFormReady?: boolean;
};

const button: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  minHeight: 80,
  minWidth: 160,
  padding: "14px 18px",
  borderRadius: 12,
  border: "1px solid #C5D3CF",
  background: "white",
  color: "#14352F",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

export function SellerManualPurchaseActions({
  canCreatePurchaseOrder,
  canCreateBillDraft,
  onManualPO,
  onManualBill,
  lang = "en",
  billFormReady = false,
}: SellerManualPurchaseActionsProps) {
  const isArabic = lang === "ar";
  return (
    <section aria-label={isArabic ? "إدخال المشتريات يدوياً" : "Manual purchasing"} dir={isArabic ? "rtl" : "ltr"}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {canCreatePurchaseOrder && (
          <button type="button" onClick={onManualPO} style={button} data-testid="seller-manual-po">
            <span aria-hidden="true">＋</span>
            <span>{isArabic ? "إنشاء أمر شراء يدوي" : "Manual Purchase Order"}</span>
            <small style={{ fontWeight: 400, marginTop: 4 }}>
              {isArabic ? "طلب شراء جديد" : "New PO"}
            </small>
          </button>
        )}
        {canCreateBillDraft && (
          <button
            type="button"
            onClick={onManualBill}
            disabled={!billFormReady}
            aria-disabled={!billFormReady}
            title={!billFormReady ? "Enable the Bill_Books entry form and approval workflow before activating this button." : undefined}
            style={{ ...button, opacity: billFormReady ? 1 : 0.55, cursor: billFormReady ? "pointer" : "not-allowed" }}
            data-testid="seller-manual-bill"
          >
            <span aria-hidden="true">＋</span>
            <span>{isArabic ? "إدخال فاتورة مورد" : "Manual Supplier Bill"}</span>
            <small style={{ fontWeight: 400, marginTop: 4 }}>
              {billFormReady
                ? isArabic ? "حفظ كمسودة للموافقة" : "Save draft for approval"
                : isArabic ? "قيد إعداد الربط" : "Pending workflow setup"}
            </small>
          </button>
        )}
      </div>
    </section>
  );
}
