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
    const method = String(options.method || "POST").toUpperCase();
    const requestOptions = { method, headers };
    if (method !== "GET" && method !== "HEAD") requestOptions.body = JSON.stringify(body || {});
    let response;
    try {
      response = await fetch(`${backendOrigin()}${path}`, requestOptions);
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
    if (user.grade) localStorage.setItem("tutorly_grade", user.grade);
    if (user.board) localStorage.setItem("tutorly_board", user.board);
    if (typeof user.school === "string") localStorage.setItem("tutorly_school", user.school);
    if (user.avatar_url && !localStorage.getItem("tutorly_avatar")) {
      localStorage.setItem("tutorly_avatar", user.avatar_url);
    }
    cacheUserPreferences(user);
    localStorage.setItem("tutorly_bot_try_count", "0");
    return payload;
  }

  function cacheUserPreferences(user) {
    if (!user || typeof user !== "object") return user;
    if (user.personalization && typeof user.personalization === "object") {
      localStorage.setItem("tutorly_personalization", JSON.stringify(user.personalization));
      if (user.personalization.voice_language) {
        localStorage.setItem("tutorly_voice_language", user.personalization.voice_language);
      }
      if (user.personalization.voice_intelligence) {
        localStorage.setItem("tutorly_voice_intelligence", user.personalization.voice_intelligence);
      }
    }
    if (user.preferred_voice_agent) {
      localStorage.setItem("tutorly_preferred_voice_agent", user.preferred_voice_agent);
    }
    return user;
  }

  function cacheCurrentUser(payload) {
    cacheUserPreferences(payload?.user);
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

  function socialStartUrl(provider, flow = "login") {
    const safeProvider = ["google", "microsoft", "apple"].includes(provider) ? provider : "";
    const safeFlow = flow === "signup" ? "signup" : "login";
    if (!safeProvider) throw new Error("That sign-in provider is not supported.");
    return `${backendOrigin()}/api/auth/oauth/${safeProvider}/start?flow=${safeFlow}`;
  }

  async function authenticatedDestination(payload, fallback = "maths_gpt.html") {
    if (!payload?.onboarding_required) return fallback;
    const grade = localStorage.getItem("tutorly_grade") || "";
    const board = localStorage.getItem("tutorly_board") || "";
    const school = localStorage.getItem("tutorly_school") || "";
    if (!grade || !board) return "info.html";
    try {
      await request("/api/auth/profile", { grade, board, school }, { auth: true });
      return fallback;
    } catch (error) {
      return "info.html";
    }
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
    getProviders: () => request("/api/auth/providers", null, { method: "GET" }),
    completeOAuth: (resultCode) => request("/api/auth/oauth/complete", { result_code: resultCode }).then(saveSession),
    socialStartUrl,
    authenticatedDestination,
    currentUser: () => request("/api/auth/me", null, { method: "GET", auth: true }).then(cacheCurrentUser),
    getPersonalization: () => request("/api/auth/personalization", null, { method: "GET", auth: true }),
    savePersonalization: (personalization) => request(
      "/api/auth/personalization",
      personalization,
      { method: "PUT", auth: true }
    ).then((payload) => {
      cacheUserPreferences({ personalization: payload.personalization });
      return payload;
    }),
    getVoicePreferences: () => request("/api/auth/voice-preferences", null, { method: "GET", auth: true }),
    saveVoicePreferences: (preferredVoiceAgent, completed = true) => request(
      "/api/auth/voice-preferences",
      { preferred_voice_agent: preferredVoiceAgent, voice_onboarding_completed: !!completed },
      { method: "PUT", auth: true }
    ),
    updateAcademicProfile: (grade, board, school = "") => request(
      "/api/auth/profile",
      { grade, board, school },
      { auth: true }
    ),
    updateProfile: ({ fullName, grade, board, school = "" }) => request(
      "/api/auth/profile",
      { full_name: fullName, grade, board, school },
      { auth: true }
    ),
    connectedAccounts: () => request("/api/auth/connected-accounts", null, { method: "GET", auth: true }),
    connectProvider: (provider) => request(
      `/api/auth/oauth/${encodeURIComponent(provider)}/connect-start`,
      {},
      { auth: true }
    ),
    disconnectProvider: (provider) => request(
      `/api/auth/connected-accounts/${encodeURIComponent(provider)}`,
      {},
      { method: "DELETE", auth: true }
    ),
    logout
  });
})(window);
