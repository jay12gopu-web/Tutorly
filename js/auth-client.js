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
      const error = new Error(typeof payload.detail === "string" ? payload.detail : String(payload.error || "Tutorly couldn't complete that request."));
      error.status = response.status;
      throw error;
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
    cacheUser(user);
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
    cacheUser(payload?.user);
    return payload;
  }

  function invalidateCurriculum(previous, next) {
    if (previous.board === next.board && previous.grade === next.grade) return;
    if (root.TutorlyCurriculum) {
      root.TutorlyCurriculum.invalidateProfileChange(previous, next);
    } else {
      localStorage.removeItem("tutorly_curriculum_context");
      try {
        Object.keys(sessionStorage).filter((key) => key.startsWith("tutorly_curriculum_catalog:"))
          .forEach((key) => sessionStorage.removeItem(key));
      } catch (_error) { /* Curriculum will reload when storage is unavailable. */ }
    }
  }

  function cacheUser(user) {
    if (!user?.id) return;
    const oldId = localStorage.getItem("tutorly_profile_user_id");
    const previous = { board: localStorage.getItem("tutorly_board") || "", grade: localStorage.getItem("tutorly_grade") || "" };
    if (oldId !== String(user.id)) {
      // Clear account-derived presentation caches, never chat/progress/learning data.
      ["tutorly_avatar", "tutorly_personalization", "tutorly_preferred_voice_agent", "tutorly_teacher_profile"]
        .forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem("tutorly_curriculum_context");
    }
    const fields = {
      tutorly_profile_user_id: user.id,
      tutorly_account_role: user.role || "student",
      tutorly_email: user.email,
      tutorly_signup_email: user.email,
      tutorly_signup_full_name: user.full_name,
      tutorly_name: user.full_name,
      "math-bot-name": user.full_name,
      tutorly_age: user.age,
      tutorly_grade: user.grade,
      tutorly_board: user.board,
      tutorly_school: user.school
    };
    Object.entries(fields).forEach(([key, value]) => {
      if (value == null || value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    });
    if (user.teacher_profile) localStorage.setItem("tutorly_teacher_profile", JSON.stringify(user.teacher_profile));
    else localStorage.removeItem("tutorly_teacher_profile");
    if (user.avatar_url && !localStorage.getItem("tutorly_avatar")) localStorage.setItem("tutorly_avatar", user.avatar_url);
    cacheUserPreferences(user);
    invalidateCurriculum(previous, { board: user.board || "", grade: String(user.grade || "") });
    root.dispatchEvent(new CustomEvent("tutorly:profile-updated", { detail: { user } }));
  }

  function clearSession() {
    [
      SESSION_TOKEN_KEY,
      "tutorly_logged_in",
      "tutorly_signed_up",
      "tutorly_account_role",
      "tutorly_profile_user_id",
      "tutorly_email",
      "tutorly_signup_email",
      "tutorly_signup_full_name",
      "tutorly_name",
      "math-bot-name",
      "tutorly_age",
      "tutorly_grade",
      "tutorly_board",
      "tutorly_school",
      "tutorly_teacher_profile",
      "tutorly_curriculum_context"
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
    const resolved = payload?.authenticated && payload?.user ? payload : await currentUser();
    if (resolved.onboarding_required) return "info.html";
    return resolved.user.role === "teacher" ? "teacher-workspace.html" : fallback;
  }

  async function currentUser() {
    return request("/api/auth/me", null, { method: "GET", auth: true }).then(cacheCurrentUser);
  }

  async function degreeRequest(method, file) {
    const headers = { Authorization: `Bearer ${getSessionToken()}` };
    if (file) {
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) {
        throw new Error("Choose a PDF, JPG or PNG up to 5 MB.");
      }
      headers["Content-Type"] = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : "image/jpeg");
      headers["X-Filename"] = encodeURIComponent(file.name);
    }
    let response;
    try { response = await fetch(`${backendOrigin()}/api/auth/teacher-degree`, { method, headers, ...(file ? { body: file } : {}) }); }
    catch (_error) { throw new Error("The degree service is unavailable. Please retry."); }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(typeof payload.detail === "string" ? payload.detail : "Your degree could not be saved. Please retry.");
      error.status = response.status;
      throw error;
    }
    return method === "GET" ? response.blob() : response.json();
  }

  root.TutorlyAuth = Object.freeze({
    backendOrigin,
    getSessionToken,
    saveSession,
    clearSession,
    requestOtp: (email) => request("/api/auth/request-otp", { email }),
    verifyOtp: (email, code) => request("/api/auth/verify-otp", { email, code }).then(saveSession),
    passwordLogin: (email, password) => request("/api/auth/password-login", { email, password }).then(saveSession),
    register: (fullName, email, password) => request("/api/auth/register", { full_name: fullName, email, password }, { auth: true }).then(saveSession),
    getProviders: () => request("/api/auth/providers", null, { method: "GET" }),
    completeOAuth: (resultCode) => request("/api/auth/oauth/complete", { result_code: resultCode }).then(saveSession),
    socialStartUrl,
    authenticatedDestination,
    currentUser,
    completeOnboarding: (profile) => request("/api/auth/onboarding", profile, { auth: true }).then(cacheCurrentUser),
    updateTeacherProfile: (profile) => request("/api/auth/teacher-profile", profile, { method: "PUT", auth: true }).then(cacheCurrentUser),
    uploadTeacherDegree: (file) => degreeRequest("PUT", file),
    removeTeacherDegree: () => degreeRequest("DELETE"),
    teacherDegreeBlob: () => degreeRequest("GET"),
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
    getQuests: () => request("/api/quests", null, { method: "GET", auth: true }),
    recordQuestEvent: (eventType, eventId, metadata = {}) => request(
      "/api/quests/events",
      { event_type: eventType, event_id: eventId, metadata },
      { auth: true }
    ),
    recordQuestEvents: (events) => request(
      "/api/quests/events/batch",
      { events },
      { auth: true }
    ),
    updateAcademicProfile: (grade, board, school = "") => request(
      "/api/auth/profile",
      { grade, board, school },
      { auth: true }
    ),
    updateProfile: ({ fullName, age, grade, board, school = "" }) => request(
      "/api/auth/profile",
      { full_name: fullName, ...(age != null && age !== "" ? { age: Number(age) } : {}), grade, board, school },
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
