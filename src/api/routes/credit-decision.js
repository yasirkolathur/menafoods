export function decideCredit(input) {
  const {
    mode = "OBSERVE",
    customerActive = true,
    financeMode = "NORMAL",
    overdue = 0,
    orderTotal = 0,
    availableCredit = null,
    dataTrusted = false,
    overridePending = false
  } = input;

  if (!dataTrusted) return { decision: "OBSERVE", enforce: false, reason: "data_untrusted" };
  if (overridePending) return { decision: "OVERRIDE_PENDING", enforce: false, reason: "approval_pending" };
  if (!customerActive || financeMode === "PREPAID_ONLY") return { decision: "PREPAID_ONLY", enforce: mode === "ENFORCE", reason: "customer_policy" };
  if (overdue > 0) return { decision: "CREDIT_HOLD", enforce: mode === "ENFORCE", reason: "overdue" };
  if (availableCredit !== null && orderTotal > availableCredit) return { decision: "CREDIT_HOLD", enforce: mode === "ENFORCE", reason: "credit_limit" };
  return { decision: "ALLOW", enforce: false, reason: "within_policy" };
}
