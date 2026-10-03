(function () {
  "use strict";
  const PlanConfig = window.TutorlyPlanConfig;
  if (!PlanConfig) return;
  const API_BASE = window.TUTORLY_PAYMENT_API_BASE || (window.location.protocol === "file:" ? "http://127.0.0.1:3001" : window.location.origin);
  const userId = localStorage.getItem("tutorly_user_id") || "";

  function readCached() {
    try { return JSON.parse(localStorage.getItem("tutorly_subscription") || "null"); }
    catch (_error) { return null; }
  }

  function standardFallback() {
    return { currentPlan: "standard", status: "free", paymentStatus: "free", creditAllowance: 100, premiumCreditsRemaining: 100, trialActive: false };
  }

  function formatDate(value, fallback = "Not applicable") {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }

  function showToast(message, type = "info") {
    const toast = document.getElementById("paymentToast");
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function normalize(value) {
    const source = value || standardFallback();
    const candidate = PlanConfig.getPlan(source.currentPlan);
    const activePremium = candidate.premium && source.status === "active" && (source.trialActive || ["trial", "captured", "paid"].includes(source.paymentStatus));
    const plan = activePremium || candidate.id === "standard" ? candidate : PlanConfig.getPlan("standard");
    const allowance = plan.id === candidate.id && Number.isFinite(Number(source.creditAllowance)) ? Math.max(0, Number(source.creditAllowance)) : plan.monthlyPremiumCredits;
    const remaining = plan.id === candidate.id && Number.isFinite(Number(source.premiumCreditsRemaining)) ? Math.min(allowance, Math.max(0, Number(source.premiumCreditsRemaining))) : allowance;
    return { ...source, effectivePlan: plan, allowance, remaining, activePremium };
  }

  function render(raw) {
    const subscription = normalize(raw);
    const plan = subscription.effectivePlan;
    document.querySelector("#billingPlanName span").textContent = plan.name;
    document.getElementById("billingPlanCrown").hidden = !plan.premium;
    document.getElementById("billingPlanPrice").textContent = plan.amountPaise ? `₹${(plan.amountPaise / 100).toLocaleString("en-IN")}/month` : "₹0";
    document.getElementById("billingPlanStatus").textContent = subscription.trialActive ? "Trial active" : "Active";
    document.getElementById("billingCredits").textContent = `${PlanConfig.formatCredits(subscription.remaining)} / ${PlanConfig.formatCredits(subscription.allowance)} premium credits remaining`;
    document.getElementById("billingCreditFill").style.width = `${subscription.allowance ? Math.min(100, (subscription.remaining / subscription.allowance) * 100) : 0}%`;
    document.getElementById("billingReset").textContent = subscription.trialActive ? "Trial credits" : "Monthly credits";
    document.getElementById("billingResetDate").textContent = formatDate(subscription.creditsResetAt, "Reset date not supplied · contact support");
    document.getElementById("billingNextLabel").textContent = subscription.trialActive ? "Trial ends" : "Next billing date";
    document.getElementById("billingNextDate").textContent = formatDate(subscription.trialActive ? subscription.trialEndsAt : subscription.subscriptionExpiry);
    document.getElementById("billingCancelBtn").hidden = !subscription.activePremium;
    document.getElementById("standardUpgradePanel").hidden = plan.premium;
    document.getElementById("billingNote").textContent = subscription.trialActive
      ? "Your trial will not charge automatically. Choose a paid plan after it ends to continue."
      : plan.premium
        ? `Your ${plan.name} access was activated through Tutorly's verified Razorpay payment flow.`
        : "Standard includes 100 premium credits every month.";
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Tutorly billing is temporarily unavailable.");
    return data;
  }

  async function sync() {
    const note = document.getElementById('billingNote');
    const freshness = document.getElementById('billingFreshness') || document.createElement('p');
    freshness.id = 'billingFreshness'; freshness.className = 'audit-status'; freshness.setAttribute('role','status');
    if (!freshness.isConnected) note?.after(freshness);
    const retry = document.getElementById('billingRetry') || document.createElement('button');
    retry.id = 'billingRetry'; retry.type = 'button'; retry.className = 'pay-action secondary'; retry.textContent = 'Retry billing sync';
    if (!retry.isConnected) { freshness.after(retry); retry.addEventListener('click',sync); }
    retry.disabled = true;
    render(readCached() || standardFallback());
    freshness.textContent = 'Checking live billing…';
    if (!userId) { freshness.textContent = 'Billing has not been linked on this device. Displayed balance is not a live account confirmation.'; retry.disabled = false; return; }
    try {
      const data = await api(`/subscription/${encodeURIComponent(userId)}`);
      localStorage.setItem("tutorly_subscription", JSON.stringify(data.subscription));
      localStorage.setItem("tutorly_current_plan", PlanConfig.normalizePlanId(data.subscription.currentPlan));
      render(data.subscription);
      freshness.textContent = 'Last checked: ' + new Date().toLocaleString();
    } catch (_error) {
      freshness.textContent = 'Live billing could not be checked. Showing a saved/device estimate, not a confirmed current balance. Retry or contact support; do not retry a payment just to check its status.';
    }
    retry.disabled = false;
  }

  document.getElementById("billingCancelBtn")?.addEventListener("click", async () => {
    if (!confirm("Cancel your active Tutorly plan and return to Standard?")) return;
    try {
      const data = await api("/cancel-subscription", { method: "POST", body: JSON.stringify({ userId }) });
      localStorage.setItem("tutorly_subscription", JSON.stringify(data.subscription));
      localStorage.setItem("tutorly_current_plan", "standard");
      render(data.subscription);
      showToast("Your plan is now Standard.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  document.addEventListener("DOMContentLoaded", sync);
})();
