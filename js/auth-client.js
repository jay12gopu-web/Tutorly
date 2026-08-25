(function (root) {
  "use strict";

  const SESSION_TOKEN_KEY = "tutorly_session_token";

  function backendOrigin() {
    const configured = root.TUTORLY_BACKEND_ORIGIN || (() => {
      try { return localStorage.getItem("tutorly_backend_origin") || ""; }
      catch (error) { return ""; }
    })();
    if (configured) return String(configured).replace(/\/+$/, "");
    const fastApiHere = root.location.hostname === "127.0.0.1" && root.location.port === "8000";
    if (fastApiHere) return root.location.origin;
    if (!["127.0.0.1", "localhost"].includes(root.location.hostname) && ["http:", "https:"].includes(root.location.protocol)) {
      return "https://tutorly-api.onrender.com";
    }
    return "http://127.0.0.1:8000";
  }

  async function request(path, body, options = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = getSessionToken();
    if (options.auth && token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${backendOrigin()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {})
      });
    } catch (error) {
      throw new Error("Tutorly's login service is unavailable. Please try again.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 && path.startsWith("/api/auth/")) {
        throw new Error("Tutorly's login service is updating. Please try again in a few minutes.");
      }
      throw new Error(String(payload.detail || payload.error || "Tutorly couldn't complete that request."));
    }
    return payload;
  }

  function getSessionToken() {
    try { return localStorage.getItem(SESSION_TOKEN_KEY) || ""; }
    catch (error) { return ""; }
  }

  function saveSession(payload) {
    if (!payload?.authenticated || !payload.session_token) throw new Error("Tutorly couldn't verify this login.");
    const user = payload.user || {};
    localStorage.setItem(SESSION_TOKEN_KEY, payload.session_token);
    localStorage.setItem("tutorly_logged_in", "true");
    localStorage.setItem("tutorly_signed_up", "true");
    localStorage.setItem("tutorly_account_role", "student");
    if (user.email) {
      localStorage.setItem("tutorly_email", user.email);
      localStorage.setItem("tutorly_signup_email", user.email);
    }
    if (user.full_name) localStorage.setItem("tutorly_signup_full_name", user.full_name);
    localStorage.setItem("tutorly_bot_try_count", "0");
    return payload;
  }

  function clearSession() {
    [
      SESSION_TOKEN_KEY,
      "tutorly_logged_in",
      "tutorly_signed_up",
      "tutorly_account_role"
    ].forEach((key) => localStorage.removeItem(key));
  }

  async function logout() {
    try { await request("/api/auth/logout", {}, { auth: true }); }
    catch (error) { /* Local logout still completes if the network is down. */ }
    clearSession();
  }

  root.TutorlyAuth = Object.freeze({
    backendOrigin,
    getSessionToken,
    saveSession,
    clearSession,
    requestOtp: (email) => request("/api/auth/request-otp", { email }),
    verifyOtp: (email, code) => request("/api/auth/verify-otp", { email, code }).then(saveSession),
    passwordLogin: (email, password) => request("/api/auth/password-login", { email, password }).then(saveSession),
    register: (fullName, email, password) => request("/api/auth/register", { full_name: fullName, email, password }).then(saveSession),
    logout
  });
})(window);
