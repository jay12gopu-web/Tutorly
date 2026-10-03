(function () {
  const escape = value => String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const API_BASE = window.TUTORLY_PAYMENT_API_BASE ||
    (window.location.protocol === "file:" ? "http://127.0.0.1:3001" : window.location.origin);

  function getUserId() {
    const userId = localStorage.getItem("tutorly_user_id");
    // A read-only history page must never manufacture a new billing identity.
    // The authenticated billing bridge is a separate release/configuration gate.
    if (!userId) throw new Error("Payment account could not be resolved.");
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
          <h3>${escape(payment.planName)}</h3>
          <p>${escape(new Date(payment.createdAt).toLocaleString("en-IN"))} · Order ${escape(payment.orderId)}</p>
          <span class="history-pill">${escape(payment.paymentStatus)}</span>
        </div>
        <div class="history-amount">${money(payment.amount, payment.currency)}</div>
      </article>
    `).join("");
  }

  async function loadHistory() {
    const list = document.getElementById("historyList");
    if (list) list.textContent = 'Loading payment history…';
    try {
      const data = await api(`/history/${encodeURIComponent(getUserId())}`);
      renderPayments(data.payments || []);
    } catch (error) {
      if (list) {
        list.innerHTML = `
          <article class="history-item">
            <div>
              <h3>Payment history unavailable</h3>
              <p>Tutorly could not reach the configured payment service. This does not mean your payment failed. Your saved records have not been changed.</p>
            </div>
            <a class="pay-action secondary" href="subscriptions.html">Back</a>
            <button class="pay-action secondary" id="retryHistory" type="button">Retry</button>
            <a class="pay-action secondary" href="contact.html?topic=subscriptions">Contact billing support</a>
          </article>
        `;
        document.getElementById('retryHistory')?.addEventListener('click',loadHistory);
      }
    }
  }
  document.addEventListener("DOMContentLoaded", loadHistory);
})();
