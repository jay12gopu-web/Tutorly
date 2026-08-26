(function (root) {
  "use strict";

  const host = document.querySelector("[data-connected-accounts]");
  if (!host || !root.TutorlyAuth?.getSessionToken?.()) return;

  const icons = {
    google: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>`,
    microsoft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f35325" d="M2 2h9v9H2z"/><path fill="#81bc06" d="M13 2h9v9h-9z"/><path fill="#05a6f0" d="M2 13h9v9H2z"/><path fill="#ffba08" d="M13 13h9v9h-9z"/></svg>`,
    apple: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.8c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.3-.8a4.9 4.9 0 0 0-4.1 2.5c-1.8 3-.5 7.5 1.2 10 .9 1.2 1.8 2.5 3.2 2.4 1.3-.1 1.8-.8 3.4-.8 1.5 0 2 .8 3.4.8 1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-3.2-1.2-3.2-4Zm-2.4-7.1c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.2-1.5Z"/></svg>`
  };

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function render(accounts) {
    const visible = accounts.filter((account) => account.configured || account.connected);
    const card = host.closest("[data-connected-accounts-card]");
    if (!visible.length) {
      if (card) card.hidden = true;
      return;
    }
    if (card) card.hidden = false;
    host.innerHTML = visible.map((account) => `
      <div class="connected-account-row">
        <span class="connected-account-icon">${icons[account.provider] || ""}</span>
        <span class="connected-account-copy">
          <strong>${escapeHtml(account.label)}</strong>
          <span>${account.connected ? `Connected${account.email ? ` · ${escapeHtml(account.email)}` : ""}` : "Not connected"}</span>
        </span>
        <button class="connected-account-action${account.connected ? " danger" : ""}" type="button" data-provider-action="${account.provider}" data-connected="${account.connected}">${account.connected ? "Disconnect" : "Connect"}</button>
      </div>
    `).join("");

    host.querySelectorAll("[data-provider-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.providerAction;
        button.disabled = true;
        try {
          if (button.dataset.connected === "true") {
            if (!root.confirm(`Disconnect ${provider} from this Tutorly account?`)) return;
            await root.TutorlyAuth.disconnectProvider(provider);
            await load();
          } else {
            const payload = await root.TutorlyAuth.connectProvider(provider);
            if (!payload.authorization_url) throw new Error("This account could not be connected.");
            root.location.assign(payload.authorization_url);
          }
        } catch (error) {
          root.alert(error.message || "This account could not be updated.");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function load() {
    try {
      const payload = await root.TutorlyAuth.connectedAccounts();
      render(Array.isArray(payload.accounts) ? payload.accounts : []);
    } catch (error) {
      const card = host.closest("[data-connected-accounts-card]");
      if (card) card.hidden = true;
    }
  }

  const params = new URLSearchParams(root.location.search);
  if (params.get("oauth_connected")) {
    history.replaceState({}, document.title, root.location.pathname);
  } else if (params.get("oauth_error")) {
    const code = params.get("oauth_error");
    history.replaceState({}, document.title, root.location.pathname);
    root.alert(code === "identity_in_use"
      ? "That provider account is already connected to another Tutorly account."
      : "The provider could not be connected. Please try again.");
  }
  load();
})(window);
