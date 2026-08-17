(function () {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") || "success";
  const plan = params.get("plan") || localStorage.getItem("tutorly_current_plan") || "plus";
  const orderId = params.get("orderId") || "";

  const title = document.getElementById("successTitle");
  const copy = document.getElementById("successCopy");
  const badge = document.getElementById("successBadge");
  const retry = document.getElementById("retryPayment");

  if (status === "success") {
    if (title) title.textContent = "Payment successful";
    if (copy) copy.textContent = `Your ${plan} access is active. Order ${orderId || "verified"} is saved in payment history.`;
    if (badge) badge.textContent = "✓";
    if (retry) retry.hidden = true;
  } else {
    if (title) title.textContent = "Payment needs attention";
    if (copy) copy.textContent = "The payment was not verified. Please retry from the subscriptions page.";
    if (badge) badge.textContent = "!";
    if (retry) retry.hidden = false;
  }
})();
