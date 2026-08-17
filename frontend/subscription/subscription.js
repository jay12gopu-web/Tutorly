(function () {
  const PLAN_LABELS = {
    casual: "Casual",
    plus: "Tutorly",
    pro: "Tutorly Campus",
    "session-1": "1 Tutoring Session"
  };

  const API_BASE = window.TUTORLY_PAYMENT_API_BASE ||
    (window.location.protocol === "file:" ? "http://127.0.0.1:3001" : window.location.origin);

  const state = {
    userId: getUserId(),
    loadingPlanId: null,
    subscription: getLocalSubscription()
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

  function saveSubscription(subscription) {
    if (!subscription) return;
    state.subscription = subscription;
    localStorage.setItem("tutorly_subscription", JSON.stringify(subscription));
    localStorage.setItem("tutorly_current_plan", subscription.currentPlan || "casual");
  }

  function money(amountPaise) {
    return `â‚¹${Math.round((Number(amountPaise) || 0) / 100).toLocaleString("en-IN")}`;
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
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }

  function setLoading(planId, isLoading) {
    state.loadingPlanId = isLoading ? planId : null;
    document.querySelectorAll("[data-plan-button]").forEach((button) => {
      const buttonPlan = button.getAttribute("data-plan-button");
      const loading = state.loadingPlanId === buttonPlan;
      button.disabled = !!state.loadingPlanId;
      if (loading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.innerHTML = '<span class="loading-inline">Processing</span>';
      } else if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    });
  }

  function renderCurrentPlan() {
    const subscription = state.subscription || {};
    const currentPlan = subscription.currentPlan || "casual";
    const currentName = PLAN_LABELS[currentPlan] || currentPlan;
    const currentPlanName = document.getElementById("currentPlanName");
    const currentPlanMeta = document.getElementById("currentPlanMeta");
    const subscriptionExpiry = document.getElementById("subscriptionExpiry");
    const cancelBtn = document.getElementById("cancelSubscriptionBtn");

    if (currentPlanName) currentPlanName.textContent = currentName;
    if (currentPlanMeta) {
      currentPlanMeta.textContent = subscription.status === "active"
        ? "Active premium subscription"
        : currentPlan === "casual"
          ? "Free plan active"
          : "Subscription inactive";
    }
    if (subscriptionExpiry) {
      subscriptionExpiry.textContent = subscription.subscriptionExpiry
        ? new Date(subscription.subscriptionExpiry).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "No expiry";
    }
    if (cancelBtn) {
      cancelBtn.disabled = currentPlan === "casual" || subscription.status !== "active";
    }

    document.querySelectorAll("[data-current-for]").forEach((pill) => {
      pill.hidden = pill.getAttribute("data-current-for") !== currentPlan;
    });
  }

  async function refreshSubscription() {
    try {
      const data = await api(`/subscription/${encodeURIComponent(state.userId)}`);
      saveSubscription(data.subscription);
      renderCurrentPlan();
    } catch (error) {
      renderCurrentPlan();
      toast("Start the payment server to sync your subscription.", "warn");
    }
  }

  async function activateCasual() {
    try {
      setLoading("casual", true);
      const data = await api("/cancel-subscription", {
        method: "POST",
        body: JSON.stringify({ userId: state.userId })
      });
      saveSubscription(data.subscription);
      renderCurrentPlan();
      toast("Casual plan is active.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading("casual", false);
    }
  }

  async function createOrder(planId) {
    return api("/create-order", {
      method: "POST",
      body: JSON.stringify({
        userId: state.userId,
        planId,
        user: getUserProfile()
      })
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
      await api("/payment-failed", {
        method: "POST",
        body: JSON.stringify({ orderId, reason })
      });
    } catch (_error) {
      // The toast already tells the user what happened; storing failure is best-effort.
    }
  }

  function ensureRazorpayReady() {
    if (!window.Razorpay) {
      throw new Error("Razorpay Checkout did not load. Check your internet connection.");
    }
  }

  async function startCheckout(planId) {
    try {
      ensureRazorpayReady();
      setLoading(planId, true);
      const orderData = await createOrder(planId);
      const profile = getUserProfile();

      const checkout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Tutorly",
        description: orderData.plan.name,
        image: "assets/brand-star.png",
        order_id: orderData.order.id,
        prefill: profile,
        notes: {
          userId: state.userId,
          planId
        },
        theme: {
          color: "#347cff"
        },
        handler: async function onPaymentSuccess(response) {
          try {
            const verified = await verifyPayment(response, planId);
            saveSubscription(verified.subscription);
            toast("Payment verified. Subscription activated.", "success");
            window.location.href = `payment-success.html?status=success&plan=${encodeURIComponent(planId)}&orderId=${encodeURIComponent(response.razorpay_order_id)}`;
          } catch (error) {
            toast(error.message, "error");
            window.location.href = `payment-success.html?status=failed&plan=${encodeURIComponent(planId)}&orderId=${encodeURIComponent(response.razorpay_order_id || "")}`;
          } finally {
            setLoading(planId, false);
          }
        },
        modal: {
          ondismiss: function onDismiss() {
            setLoading(planId, false);
            toast("Payment popup closed. You can retry anytime.");
          }
        }
      });

      checkout.on("payment.failed", function onPaymentFailed(response) {
        setLoading(planId, false);
        const reason = response.error?.description || "Payment failed. Please retry.";
        markPaymentFailed(orderData.order.id, reason);
        toast(reason, "error");
      });

      checkout.open();
    } catch (error) {
      setLoading(planId, false);
      toast(error.message, "error");
    }
  }

  function bindButtons() {
    document.querySelectorAll("[data-plan-button]").forEach((button) => {
      button.addEventListener("click", () => {
        const planId = button.getAttribute("data-plan-button");
        if (planId === "casual") {
          activateCasual();
          return;
        }
        startCheckout(planId);
      });
    });

    const cancelBtn = document.getElementById("cancelSubscriptionBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (confirm("Cancel your active Tutorly subscription and return to Casual?")) {
          activateCasual();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    renderCurrentPlan();
    refreshSubscription();
  });
})();

