(function () {
  if (window.TutorlyPremiumGuard) return;

  const API_BASE = window.TUTORLY_PAYMENT_API_BASE ||
    (window.location.protocol === "file:" ? "http://127.0.0.1:3001" : window.location.origin);

  function getUserId() {
    let userId = localStorage.getItem("tutorly_user_id");
    if (!userId) {
      userId = `mtu_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem("tutorly_user_id", userId);
    }
    return userId;
  }

  function getLocalSubscription() {
    try {
      return JSON.parse(localStorage.getItem("tutorly_subscription") || "null");
    } catch (_error) {
      return null;
    }
  }

  function isPremiumActive(subscription = getLocalSubscription()) {
    if (!subscription) return false;
    if (!["plus", "pro"].includes(subscription.currentPlan)) return false;
    if (subscription.status !== "active") return false;
    if (!subscription.subscriptionExpiry) return false;
    return new Date(subscription.subscriptionExpiry).getTime() > Date.now();
  }

  async function syncSubscription() {
    try {
      const response = await fetch(`${API_BASE}/subscription/${encodeURIComponent(getUserId())}`);
      const data = await response.json();
      if (response.ok && data.subscription) {
        localStorage.setItem("tutorly_subscription", JSON.stringify(data.subscription));
        localStorage.setItem("tutorly_current_plan", data.subscription.currentPlan || "standard");
        return data.subscription;
      }
    } catch (_error) {
      // Local subscription data keeps the UI usable when the payment server is not running.
    }
    return getLocalSubscription();
  }

  function ensureStyles() {
    if (document.getElementById("tutorlyPremiumGuardStyles")) return;
    const style = document.createElement("style");
    style.id = "tutorlyPremiumGuardStyles";
    style.textContent = `
      .premium-lock-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(16, 24, 40, 0.38);
        backdrop-filter: blur(12px);
      }
      .premium-lock-overlay.show { display: flex; }
      .premium-lock-card {
        width: min(460px, 96vw);
        border: 1px solid rgba(255,255,255,0.75);
        border-radius: 28px;
        padding: 24px;
        text-align: center;
        background: linear-gradient(145deg, rgba(255,255,255,0.96), rgba(238,245,255,0.88));
        box-shadow: 0 28px 72px rgba(42,71,134,0.22);
      }
      .premium-lock-card h2 {
        margin: 10px 0 8px;
        color: #17213a;
        font-size: 32px;
        line-height: 1;
      }
      .premium-lock-card p {
        color: #65728c;
        font-weight: 800;
        line-height: 1.55;
      }
      .premium-lock-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
        margin-top: 18px;
      }
      .premium-lock-actions button,
      .premium-lock-actions a {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        padding: 0 16px;
        cursor: pointer;
        font: inherit;
        font-weight: 900;
        color: #fff;
        background: linear-gradient(135deg, #347cff, #8267ff);
        text-decoration: none;
      }
      .premium-lock-actions button {
        color: #254784;
        border: 1px solid rgba(87,117,188,0.18);
        background: rgba(255,255,255,0.82);
      }
    `;
    document.head.appendChild(style);
  }

  function showUpgradePopup(featureName = "this premium AI feature") {
    ensureStyles();
    let overlay = document.getElementById("premiumLockOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "premiumLockOverlay";
      overlay.className = "premium-lock-overlay";
      overlay.innerHTML = `
        <article class="premium-lock-card" role="dialog" aria-modal="true">
          <div aria-hidden="true" style="font-size:42px;">✦</div>
          <h2>Upgrade Tutorly</h2>
          <p id="premiumLockCopy"></p>
          <div class="premium-lock-actions">
            <a href="subscriptions.html">View plans</a>
            <button type="button" id="premiumLockClose">Not now</button>
          </div>
        </article>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector("#premiumLockClose").addEventListener("click", () => overlay.classList.remove("show"));
    }
    overlay.querySelector("#premiumLockCopy").textContent = `${featureName} is available on Plus and Pro. Upgrade to keep using the premium AI tools.`;
    overlay.classList.add("show");
  }

  function requirePremium(featureName) {
    if (isPremiumActive()) return true;
    showUpgradePopup(featureName);
    syncSubscription();
    return false;
  }

  window.TutorlyPremiumGuard = {
    getUserId,
    syncSubscription,
    isPremiumActive,
    requirePremium,
    showUpgradePopup
  };

  syncSubscription();
})();
