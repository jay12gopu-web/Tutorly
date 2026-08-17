(function () {
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

  function money(amountPaise, currency = "INR") {
    const amount = (Number(amountPaise) || 0) / 100;
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  }

  async function api(path) {
    const response = await fetch(`${API_BASE}${path}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load payment history");
    return data;
  }

  function renderEmpty(list) {
    list.innerHTML = `
      <article class="history-item">
        <div>
          <h3>No payments yet</h3>
          <p>Your subscription purchases and session payments will appear here.</p>
        </div>
        <a class="pay-action secondary" href="subscriptions.html">View plans</a>
      </article>
    `;
  }

  function renderPayments(payments) {
    const list = document.getElementById("historyList");
    if (!list) return;
    if (!payments.length) {
      renderEmpty(list);
      return;
    }

    list.innerHTML = payments.map((payment) => `
      <article class="history-item">
        <div>
          <h3>${payment.planName}</h3>
          <p>${new Date(payment.createdAt).toLocaleString("en-IN")} · Order ${payment.orderId}</p>
          <span class="history-pill">${payment.paymentStatus}</span>
        </div>
        <div class="history-amount">${money(payment.amount, payment.currency)}</div>
      </article>
    `).join("");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById("historyList");
    try {
      const data = await api(`/history/${encodeURIComponent(getUserId())}`);
      renderPayments(data.payments || []);
    } catch (error) {
      if (list) {
        list.innerHTML = `
          <article class="history-item">
            <div>
              <h3>Payment server offline</h3>
              <p>${error.message}</p>
            </div>
            <a class="pay-action secondary" href="subscriptions.html">Back</a>
          </article>
        `;
      }
    }
  });
})();
