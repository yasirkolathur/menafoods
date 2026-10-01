function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function decideCredit(input = {}) {
  const mode = input.mode === "ENFORCE" ? "ENFORCE" : "OBSERVE";
  const customerActive = input.customerActive !== false;
  const financeMode = input.financeMode || "NORMAL";
  const overdue = finiteNumber(input.overdue, 0);
  const orderTotal = finiteNumber(input.orderTotal, 0);
  const availableCredit = input.availableCredit == null ? null : finiteNumber(input.availableCredit, 0);
  const dataTrusted = input.dataTrusted === true;
  const overrideStatus = input.overrideStatus || (input.overridePending ? "PENDING" : "NONE");

  if (!dataTrusted) {
    return { decision: "OBSERVE", proposed_decision: null, enforce: false, reason: "data_untrusted" };
  }

  if (overrideStatus === "PENDING") {
    return { decision: "OVERRIDE_PENDING", proposed_decision: null, enforce: false, reason: "approval_pending" };
  }

  if (overrideStatus === "APPROVED") {
    return { decision: "ALLOW", proposed_decision: null, enforce: false, reason: "override_approved" };
  }

  let proposed = "ALLOW";
  let reason = "within_policy";

  if (!customerActive || financeMode === "PREPAID_ONLY" || financeMode === "BLOCKED") {
    proposed = "PREPAID_ONLY";
    reason = "customer_policy";
  } else if (overdue > 0) {
    proposed = "CREDIT_HOLD";
    reason = "overdue";
  } else if (availableCredit !== null && orderTotal > availableCredit) {
    proposed = "CREDIT_HOLD";
    reason = "credit_limit";
  }

  if (mode === "OBSERVE" && proposed !== "ALLOW") {
    return { decision: "OBSERVE", proposed_decision: proposed, enforce: false, reason };
  }

  return {
    decision: proposed,
    proposed_decision: null,
    enforce: mode === "ENFORCE" && proposed !== "ALLOW",
    reason
  };
}
