(function () {
  "use strict";

  const PlanConfig = window.TutorlyPlanConfig;
  if (!PlanConfig) throw new Error("Tutorly plan configuration is unavailable");

  const API_BASE = window.TUTORLY_PAYMENT_API_BASE ||
    (window.location.protocol === "file:" ? "http://127.0.0.1:3001" : window.location.origin);

  const state = {
    userId: getUserId(),
    loadingKey: "",
    pendingTrialPlanId: "",
    returnFocus: null,
    subscription: normalizeSubscription(getLocalSubscription())
  };

  function getUserId() {
    let userId = localStorage.getItem("tutorly_user_id");
    if (!userId) {
      userId = `mtu_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("tutorly_user_id", userId);
    }
    return userId;
  }

  function getUserProfile() {
    return {
      name: localStorage.getItem("tutorly_name") || localStorage.getItem("math-bot-name") || "Tutorly Student",
      email: localStorage.getItem("tutorly_email") || "",
      phone: localStorage.getItem("tutorly_phone") || ""
    };
  }

  function getLocalSubscription() {
    try {
      return JSON.parse(localStorage.getItem("tutorly_subscription") || "null");
    } catch (_error) {
      return null;
    }
  }

  function normalizeSubscription(value) {
    const source = value && typeof value === "object" ? value : {};
    const plan = PlanConfig.getPlan(source.currentPlan);
    const allowance = Number.isFinite(Number(source.creditAllowance))
      ? Math.max(0, Number(source.creditAllowance))
      : plan.monthlyPremiumCredits;
    const remaining = Number.isFinite(Number(source.premiumCreditsRemaining))
      ? Math.min(allowance, Math.max(0, Number(source.premiumCreditsRemaining)))
      : allowance;
    return {
      ...source,
      currentPlan: plan.id,
      status: source.status || (plan.id === "standard" ? "free" : "inactive"),
      paymentStatus: source.paymentStatus || (plan.id === "standard" ? "free" : "inactive"),
      creditAllowance: allowance,
      premiumCreditsRemaining: remaining,
      trialActive: !!source.trialActive,
      trialEligible: source.trialEligible !== false
    };
  }

  function saveSubscription(subscription) {
    if (!subscription) return;
    state.subscription = normalizeSubscription(subscription);
    localStorage.setItem("tutorly_subscription", JSON.stringify(state.subscription));
    localStorage.setItem("tutorly_current_plan", state.subscription.currentPlan);
  }

  function formatDate(value, fallback = "Not scheduled") {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }

  function toast(message, type = "info") {
    const toastEl = document.getElementById("paymentToast");
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.dataset.type = type;
    toastEl.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove("show"), 3600);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Tutorly billing is temporarily unavailable.");
    return data;
  }

  function isEntitlementActive(subscription = state.subscription) {
    return subscription.currentPlan === "standard" ||
      (subscription.status === "active" && (subscription.trialActive || ["captured", "paid", "trial"].includes(subscription.paymentStatus)));
  }

  function getEffectivePlanId() {
    return isEntitlementActive() ? state.subscription.currentPlan : "standard";
  }

  function setLoading(key, loading) {
    state.loadingKey = loading ? key : "";
    renderCurrentPlan();
  }

  function renderCurrentPlan() {
    const subscription = state.subscription;
    const currentPlanId = getEffectivePlanId();
    const currentPlan = PlanConfig.getPlan(currentPlanId);
    const currentPlanName = document.getElementById("currentPlanName");
    const currentPlanMeta = document.getElementById("currentPlanMeta");
    const currentCredits = document.getElementById("currentCredits");
    const creditResetDate = document.getElementById("creditResetDate");
    const meter = document.getElementById("creditMeterFill");
    const allowance = currentPlanId === subscription.currentPlan
      ? subscription.creditAllowance
      : currentPlan.monthlyPremiumCredits;
    const remaining = currentPlanId === subscription.currentPlan
      ? subscription.premiumCreditsRemaining
      : currentPlan.monthlyPremiumCredits;

    if (currentPlanName) currentPlanName.textContent = currentPlan.name;
    if (currentPlanMeta) {
      currentPlanMeta.textContent = subscription.trialActive
        ? `${currentPlan.name} trial · ends ${formatDate(subscription.trialEndsAt, "soon")}`
        : `${PlanConfig.formatCredits(allowance)} premium credits each month`;
    }
    if (currentCredits) currentCredits.textContent = PlanConfig.formatCredits(remaining);
    if (creditResetDate) {
      const label = subscription.trialActive ? "Trial ends" : "Credits reset";
      creditResetDate.textContent = `${label} ${formatDate(subscription.trialActive ? subscription.trialEndsAt : subscription.creditsResetAt, "when the next cycle starts")}`;
    }
    if (meter) meter.style.width = `${allowance > 0 ? Math.min(100, Math.max(0, (remaining / allowance) * 100)) : 0}%`;

    document.querySelectorAll("[data-plan-card]").forEach((card) => {
      card.dataset.current = card.getAttribute("data-plan-card") === currentPlanId ? "true" : "false";
    });

    document.querySelectorAll("[data-plan-cta]").forEach((button) => {
      const planId = button.getAttribute("data-plan-cta");
      const plan = PlanConfig.getPlan(planId);
      const isCurrent = planId === currentPlanId;
      const trialAvailable = plan.premium && subscription.trialEligible !== false && currentPlanId === "standard";
      const loading = state.loadingKey === `pay:${planId}` ||
        state.loadingKey === `trial:${planId}` ||
        state.loadingKey === `standard:${planId}`;
      button.disabled = isCurrent || !!state.loadingKey;
      button.setAttribute("aria-current", isCurrent ? "true" : "false");
      if (loading) {
        button.innerHTML = `<span class="loading-inline">${state.loadingKey.startsWith("trial:") ? "Starting trial" : "Processing"}</span>`;
      } else if (isCurrent) {
        button.textContent = "Current plan";
      } else if (planId === "standard") {
        button.textContent = "Switch to Standard";
      } else if (trialAvailable) {
        button.textContent = `Try ${plan.name} free →`;
      } else {
        button.textContent = `Choose ${plan.name} →`;
      }
    });
  }

  function renderCreditCosts() {
    document.querySelectorAll("[data-credit-cost]").forEach((element) => {
      const key = element.getAttribute("data-credit-cost");
      const item = PlanConfig.CREDIT_COSTS[key];
      if (!item) return;
      element.textContent = item.minCredits
        ? `${item.minCredits}–${item.maxCredits} credits`
        : item.perMinutes
          ? `${item.credits} credit / ${item.perMinutes} min`
          : key === "shortDocument"
            ? `${item.credits}+ credits`
            : `${item.credits} ${item.credits === 1 ? "credit" : "credits"}`;
    });

    const list = document.getElementById("creditCostsList");
    if (!list) return;
    const visibleCosts = Object.values(PlanConfig.CREDIT_COSTS).filter((item) => item.available);
    list.replaceChildren(...visibleCosts.map((item) => {
      const card = document.createElement("article");
      const label = document.createElement("span");
      const cost = document.createElement("strong");
      label.textContent = item.label;
      cost.textContent = item.minCredits
        ? `${item.minCredits}–${item.maxCredits} credits`
        : item.perMinutes
          ? `${item.credits} credit / ${item.perMinutes} minutes`
          : `${item.credits} ${item.credits === 1 ? "credit" : "credits"}`;
      card.append(label, cost);
      return card;
    }));
  }

  async function refreshSubscription() {
    try {
      const data = await api(`/subscription/${encodeURIComponent(state.userId)}`);
      saveSubscription(data.subscription);
      renderCurrentPlan();
    } catch (_error) {
      renderCurrentPlan();
      toast("Showing your saved plan. Live billing sync is temporarily unavailable.", "warn");
    }
  }

  async function activateStandard() {
    try {
      setLoading("standard:standard", true);
      const data = await api("/cancel-subscription", {
        method: "POST",
        body: JSON.stringify({ userId: state.userId })
      });
      saveSubscription(data.subscription);
      toast("Standard is now your active plan.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading("", false);
    }
  }

  function openTrialDialog(planId, trigger) {
    const plan = PlanConfig.getPlan(planId);
    const dialog = document.getElementById("trialDialog");
    if (!dialog || !plan.premium) return;
    state.pendingTrialPlanId = plan.id;
    state.returnFocus = trigger || document.activeElement;
    document.getElementById("trialDialogTitle").textContent = `Start your ${plan.trialDays}-day ${plan.name} trial?`;
    document.getElementById("trialDialogDetails").textContent = `${PlanConfig.formatCredits(plan.trialCredits)} trial credits are included. When the trial ends, choose ₹${(plan.amountPaise / 100).toLocaleString("en-IN")}/month to continue. You will not be charged automatically.`;
    dialog.hidden = false;
    dialog.classList.add("show");
    dialog.setAttribute("aria-hidden", "false");
    document.getElementById("trialDialogConfirm")?.focus();
  }

  function closeTrialDialog(options = {}) {
    const dialog = document.getElementById("trialDialog");
    if (!dialog) return;
    dialog.classList.remove("show");
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    state.pendingTrialPlanId = "";
    if (options.restoreFocus !== false) state.returnFocus?.focus?.();
    state.returnFocus = null;
  }

  async function startTrial(planId) {
    try {
      closeTrialDialog({ restoreFocus: false });
      setLoading(`trial:${planId}`, true);
      const data = await api("/start-trial", {
        method: "POST",
        body: JSON.stringify({ userId: state.userId, planId })
      });
      saveSubscription(data.subscription);
      toast(`${PlanConfig.getPlan(planId).name} trial started.`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading("", false);
    }
  }

  async function createOrder(planId) {
    return api("/create-order", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, planId, user: getUserProfile() })
    });
  }

  async function verifyPayment(response, planId) {
    return api("/verify-payment", {
      method: "POST",
      body: JSON.stringify({
        userId: state.userId,
        planId,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature
      })
    });
  }

  async function markPaymentFailed(orderId, reason) {
    if (!orderId) return;
    try {
      await api("/payment-failed", { method: "POST", body: JSON.stringify({ orderId, reason }) });
    } catch (_error) {
      // Failure recording is best-effort; the visible checkout state remains usable.
    }
  }

  async function startCheckout(planId) {
    try {
      if (!window.Razorpay) throw new Error("Razorpay Checkout did not load. Check your connection and try again.");
      setLoading(`pay:${planId}`, true);
      const orderData = await createOrder(planId);
      const profile = getUserProfile();
      const checkout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Tutorly",
        description: `${orderData.plan.name} monthly plan`,
        image: "assets/brand-star.png",
        order_id: orderData.order.id,
        prefill: profile,
        notes: { userId: state.userId, planId },
        theme: { color: "#347cff" },
        handler: async function onPaymentSuccess(response) {
          try {
            const verified = await verifyPayment(response, planId);
            saveSubscription(verified.subscription);
            window.location.href = `payment-success.html?status=success&plan=${encodeURIComponent(planId)}&orderId=${encodeURIComponent(response.razorpay_order_id)}`;
          } catch (error) {
            toast(error.message, "error");
            window.location.href = `payment-success.html?status=failed&plan=${encodeURIComponent(planId)}&orderId=${encodeURIComponent(response.razorpay_order_id || "")}`;
          } finally {
            setLoading("", false);
          }
        },
        modal: {
          ondismiss: function onDismiss() {
            setLoading("", false);
            toast("Payment window closed. You can retry whenever you’re ready.");
          }
        }
      });
      checkout.on("payment.failed", function onPaymentFailed(response) {
        setLoading("", false);
        const reason = response.error?.description || "Payment failed. Please try again.";
        markPaymentFailed(orderData.order.id, reason);
        toast(reason, "error");
      });
      checkout.open();
    } catch (error) {
      setLoading("", false);
      toast(error.message, "error");
    }
  }

  function bindButtons() {
    document.querySelectorAll("[data-plan-cta]").forEach((button) => {
      button.addEventListener("click", () => {
        const planId = button.getAttribute("data-plan-cta");
        if (planId === getEffectivePlanId()) return;
        if (planId === "standard") {
          if (getEffectivePlanId() === "standard" || confirm("Switch to Standard and end your current paid plan or trial?")) activateStandard();
          return;
        }
        const trialAvailable = state.subscription.trialEligible !== false && getEffectivePlanId() === "standard";
        if (trialAvailable) openTrialDialog(planId, button);
        else startCheckout(planId);
      });
    });

    document.querySelectorAll("[data-plan-button]").forEach((button) => {
      button.addEventListener("click", () => {
        const planId = button.getAttribute("data-plan-button");
        if (planId === "standard") {
          if (getEffectivePlanId() === "standard" || confirm("Switch to Standard and end your current paid plan or trial?")) activateStandard();
          return;
        }
        startCheckout(planId);
      });
    });
    document.querySelectorAll("[data-trial-button]").forEach((button) => {
      button.addEventListener("click", () => openTrialDialog(button.getAttribute("data-trial-button"), button));
    });

    document.getElementById("comparePlansButton")?.addEventListener("click", (event) => {
      const comparison = document.getElementById("planComparison");
      if (!comparison) return;
      const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
      comparison.hidden = expanded;
      event.currentTarget.setAttribute("aria-expanded", String(!expanded));
      event.currentTarget.textContent = expanded ? "Compare every feature ↓" : "Hide comparison ↑";
      if (!expanded) comparison.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    document.getElementById("trialDialogClose")?.addEventListener("click", closeTrialDialog);
    document.getElementById("trialDialogCancel")?.addEventListener("click", closeTrialDialog);
    document.getElementById("trialDialogConfirm")?.addEventListener("click", () => {
      const planId = state.pendingTrialPlanId;
      if (planId) startTrial(planId);
    });
    document.getElementById("trialDialog")?.addEventListener("click", (event) => {
      if (event.target.id === "trialDialog") closeTrialDialog();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.getElementById("trialDialog")?.hidden) closeTrialDialog();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    renderCreditCosts();
    renderCurrentPlan();
    refreshSubscription();
  });
})();
