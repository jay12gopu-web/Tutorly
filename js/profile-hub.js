(function (root) {
  "use strict";

  const Auth = root.TutorlyAuth;
  const Plans = root.TutorlyPlanConfig;
  const VoiceConfig = root.TutorlyVoiceConfig;
  const DEFAULTS = Object.freeze({
    teaching_style: "friendly",
    answer_detail: "balanced",
    learning_approach: "explain_first",
    use_examples: true,
    show_diagrams: true,
    show_formulas: true,
    suggest_follow_ups: false,
    quick_answers: true,
    language: "auto",
    voice_language: "auto",
    voice_intelligence: "standard"
  });
  const LANGUAGES = Object.freeze([
    ["auto", "Auto"], ["en-US", "English (US)"], ["en-IN", "English (India)"],
    ["en-GB", "English (UK)"], ["hi-IN", "Hindi"], ["te-IN", "Telugu"],
    ["ta-IN", "Tamil"], ["bn-IN", "Bengali"], ["mr-IN", "Marathi"],
    ["es-ES", "Spanish"], ["fr-FR", "French"], ["de-DE", "German"]
  ]);
  const VALID_SECTIONS = new Set(["profile", "personalization", "voice", "billing", "usage", "security", "privacy", "account"]);

  const $ = (id) => document.getElementById(id);
  let boardPicker;
  const state = {
    authStatus: "loading",
    profile: {},
    personalization: { ...DEFAULTS },
    subscription: null
  };
  let profileRequest = 0;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function readSubscription(payload) {
    // Only consume a subscription returned with this authenticated account.
    // The current auth API does not supply billing yet; a device cache is not proof.
    const saved = payload.subscription || payload.user?.subscription;
    if (!saved || !Plans?.PLANS?.[saved.currentPlan]) return null;
    const validNumber = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (!validNumber(saved.creditAllowance) || !validNumber(saved.premiumCreditsRemaining)) return null;
    return { ...saved, plan: Plans.PLANS[saved.currentPlan], allowance: saved.creditAllowance,
      remaining: Math.min(saved.creditAllowance, saved.premiumCreditsRemaining) };
  }

  function showSession(status, message) {
    state.authStatus = status;
    $("profileAccountContent").hidden = status !== "authenticated";
    $("profileSessionState").hidden = status === "authenticated";
    $("profileSessionState").setAttribute("aria-busy", String(status === "loading"));
    $("profileSessionTitle").textContent = {
      loading: "Checking your account…", signed_out: "You're signed out", expired: "Your session has expired",
      error: "We couldn't check your account", onboarding: "Finish setting up your profile"
    }[status] || "Your Tutorly account";
    $("profileSessionMessage").textContent = message || (status === "loading"
      ? "Please wait while Tutorly checks your session."
      : "Sign in to view your account, plan and settings. Your learning data on this device has not been removed.");
    $("profileSessionRetry").hidden = status !== "error";
    $("profileSessionRetry").disabled = status === "loading";
    $("profileSignIn").hidden = !["signed_out", "expired", "error", "onboarding"].includes(status);
    $("profileSignIn").href = status === "onboarding" ? "info.html" : "login.html?intent=profile";
    $("profileSignIn").textContent = status === "onboarding" ? "Continue setup" : "Sign in";
  }

  function handleSessionError(error) {
    if (error?.status === 401) {
      Auth?.clearSession?.();
      showSession("expired");
      return true;
    }
    return false;
  }

  function toast(message, type = "success") {
    const node = $("profileToast");
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
  }

  function safeUsername() {
    const explicit = state.profile.username;
    if (explicit) return explicit.replace(/^@/, "");
    const emailName = String(state.profile.email || "").split("@")[0].replace(/[^a-z0-9._-]/gi, "");
    const name = String(state.profile.name || "student").toLowerCase().replace(/[^a-z0-9]/g, "");
    return emailName || name || "student";
  }

  function renderProfile() {
    const profile = state.profile;
    const isTeacher = profile.role === "teacher";
    document.querySelectorAll("[data-student-profile]").forEach((node) => {
      node.hidden = isTeacher; node.querySelectorAll("input, select").forEach((input) => { input.disabled = isTeacher; });
    });
    document.querySelectorAll("[data-teacher-profile]").forEach((node) => { node.hidden = !isTeacher; });
    if (isTeacher) {
      const teacher = profile.teacher || {};
      $("summarySubjects").textContent = (teacher.subjects || []).join(", ") || "Not set";
      $("summaryBoards").textContent = (teacher.boards || []).join(", ") || "Not set";
      $("summaryGradeRange").textContent = teacher.grade_min ? `Grades ${teacher.grade_min}–${teacher.grade_max}` : "Not set";
      $("summaryVerification").textContent = { verified: "Verified", rejected: "Needs attention", pending: "Pending" }[teacher.verification_status] || "Pending";
      $("profileDetailsHelp").textContent = "Your teacher profile. Degree upload does not grant verified status.";
      document.querySelector(".profile-back-link").href = "teacher-workspace.html";
      document.querySelector(".profile-back-link").textContent = "Teacher workspace";
    }
    const initial = String(profile.name || "Student").trim().charAt(0).toUpperCase() || "S";
    $("profileTitle").textContent = profile.name || "Student";
    $("profileUsername").textContent = `@${safeUsername()}`;
    const education = document.getElementById("profileEducation");
    if (education) education.textContent = isTeacher ? "Teacher account" : [profile.grade ? `Grade ${profile.grade}` : "", profile.board || ""].filter(Boolean).join(" · ");
    const school = document.getElementById("profileSchool");
    if (school) { school.textContent = profile.school || ""; school.hidden = !profile.school; }
    $("profileAvatarInitial").textContent = initial;
    const image = $("profileAvatarImage");
    if (profile.avatar && /^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/)/i.test(profile.avatar)) {
      image.src = profile.avatar;
      image.hidden = false;
      $("profileAvatarInitial").hidden = true;
    } else {
      image.hidden = true;
      $("profileAvatarInitial").hidden = false;
    }

    $("summaryName").textContent = profile.name || "Student";
    $("summaryEmail").textContent = profile.email || "Not set";
    $("summaryGrade").textContent = profile.grade ? `Grade ${profile.grade}` : "Not set";
    $("summaryBoard").textContent = profile.board || "Not set";
    $("summarySchool").textContent = profile.school || "Optional";
    $("summaryAge").textContent = profile.age || "Not set";
    $("ageInput").value = profile.age || "";
    $("nameInput").value = profile.name || "";
    $("emailInput").value = profile.email || "";
    $("gradeInput").value = profile.grade || "";
    $("boardInput").value = profile.board || "";
    $("schoolInput").value = profile.school || "";
    boardPicker?.setValue(profile.board || "");
  }

  function renderSubscription() {
    if (!state.subscription) {
      $("profilePlan").textContent = $("billingPlan").textContent = "Plan unavailable";
      $("profilePlan").dataset.premium = "false";
      $("profileCredits").textContent = $("usageRemaining").textContent = "Credits unavailable";
      $("creditsStat").textContent = $("usagePercentage").textContent = "—";
      $("creditsAllowance").textContent = "Balance not confirmed";
      $("billingCredits").textContent = "Balance not confirmed. Check Billing for its sync status.";
      $("usageMeterFill").style.width = "0%";
      $("usageReset").textContent = "Reset date not confirmed";
      $("managePlanLink").href = "billing.html";
      $("managePlanLink").textContent = "Check billing";
      return;
    }
    const { plan, allowance, remaining } = state.subscription;
    const credits = Plans?.formatCredits?.(remaining) || remaining.toLocaleString("en-IN");
    const total = Plans?.formatCredits?.(allowance) || allowance.toLocaleString("en-IN");
    const percent = allowance > 0 ? Math.round((remaining / allowance) * 100) : 0;
    $("profilePlan").textContent = plan.name;
    $("profilePlan").dataset.premium = String(!!plan.premium);
    $("profileCredits").textContent = `${credits} premium credits remaining`;
    $("creditsStat").textContent = credits;
    $("creditsAllowance").textContent = `of ${total} this month`;
    $("billingPlan").textContent = plan.name;
    $("billingCredits").textContent = `${credits} of ${total} premium credits remaining`;
    $("managePlanLink").href = plan.premium ? "billing.html" : "subscriptions.html";
    $("managePlanLink").textContent = plan.premium ? "Manage plan" : "View plans";
    $("usageRemaining").textContent = `${credits} credits remaining`;
    $("usagePercentage").textContent = `${percent}%`;
    $("usageMeterFill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (state.subscription.creditsResetAt) {
      const reset = new Date(state.subscription.creditsResetAt);
      if (!Number.isNaN(reset.getTime())) $("usageReset").textContent = `Resets ${reset.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`;
    }
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function collectActivityDates() {
    const values = [];
    const tests = readJson("tutorly_exam_history", []);
    (Array.isArray(tests) ? tests : []).forEach((item) => values.push(item?.date || item?.completedAt || item?.createdAt));
    const lessons = readJson("tutorly_lesson_progress", {});
    Object.values(lessons || {}).forEach((item) => values.push(item?.lastOpened || item?.updatedAt));
    const chatState = readJson("tutorly_chatbot_history_v1", {});
    const legacyChats = readJson("tutorly_chat_history_v1", []);
    const chats = Array.isArray(chatState?.conversations) ? chatState.conversations : (Array.isArray(legacyChats) ? legacyChats : []);
    chats.forEach((item) => values.push(item?.updatedAt || item?.createdAt));
    return values.map(dateKey).filter(Boolean);
  }

  function streaks(keys) {
    const unique = [...new Set(keys)].sort();
    let longest = 0;
    let run = 0;
    let previous = null;
    unique.forEach((key) => {
      const current = new Date(`${key}T12:00:00`);
      const gap = previous ? Math.round((current - previous) / 86400000) : 0;
      run = !previous || gap === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = current;
    });
    let current = 0;
    if (unique.length) {
      const latest = new Date(`${unique[unique.length - 1]}T12:00:00`);
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const age = Math.round((today - latest) / 86400000);
      if (age <= 1) {
        current = 1;
        for (let index = unique.length - 2; index >= 0; index -= 1) {
          const newer = new Date(`${unique[index + 1]}T12:00:00`);
          const older = new Date(`${unique[index]}T12:00:00`);
          if (Math.round((newer - older) / 86400000) !== 1) break;
          current += 1;
        }
      }
    }
    return { current, longest: Math.max(longest, current) };
  }

  function renderActivity() {
    const keys = collectActivityDates();
    const counts = keys.reduce((map, key) => map.set(key, (map.get(key) || 0) + 1), new Map());
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - 69);
    const cells = [];
    for (let index = 0; index < 70; index += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const count = counts.get(dateKey(day)) || 0;
      const cell = document.createElement("span");
      cell.className = "activity-cell";
      cell.dataset.level = String(Math.min(3, count));
      cell.title = `${day.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${count} ${count === 1 ? "activity" : "activities"}`;
      cells.push(cell);
    }
    $("activityCalendar").replaceChildren(...cells);
    const summary = streaks(keys);
    const savedStreak = Math.max(0, Number(localStorage.getItem("tutorly_streak")) || 0);
    // Progress and Profile use the same recorded streak, not page visits.
    const current = savedStreak;
    const longest = Math.max(summary.longest, current, Number(localStorage.getItem("tutorly_longest_streak")) || 0);
    $("currentStreak").textContent = String(current);
    $("longestStreak").textContent = String(longest);
    localStorage.setItem("tutorly_longest_streak", String(longest));
    $("activitySummary").textContent = keys.length ? `${keys.length} saved learning ${keys.length === 1 ? "activity" : "activities"} in Tutorly.` : "No learning activity yet.";
    $("activityCalendar").setAttribute("aria-label", keys.length ? `${keys.length} study activities in the last ten weeks` : "No study activity in the last ten weeks");
  }

  function populateLanguages() {
    [$("responseLanguage"), $("voiceLanguage")].forEach((select) => {
      select.replaceChildren(...LANGUAGES.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
    });
  }

  function checkRadio(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (input) input.checked = true;
  }

  function renderPersonalization() {
    const prefs = { ...DEFAULTS, ...state.personalization };
    state.personalization = prefs;
    checkRadio("teachingStyle", prefs.teaching_style);
    checkRadio("answerDetail", prefs.answer_detail);
    checkRadio("learningApproach", prefs.learning_approach);
    $("useExamples").checked = prefs.use_examples !== false;
    $("showDiagrams").checked = prefs.show_diagrams !== false;
    $("showFormulas").checked = prefs.show_formulas !== false;
    $("suggestFollowUps").checked = prefs.suggest_follow_ups === true;
    $("quickAnswers").checked = prefs.quick_answers !== false;
    $("responseLanguage").value = prefs.language;
    $("voiceLanguage").value = prefs.voice_language;
    $("voiceIntelligence").value = prefs.voice_intelligence;
  }

  function selected(name, fallback) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
  }

  function formPreferences() {
    return {
      teaching_style: selected("teachingStyle", DEFAULTS.teaching_style),
      answer_detail: selected("answerDetail", DEFAULTS.answer_detail),
      learning_approach: selected("learningApproach", DEFAULTS.learning_approach),
      use_examples: $("useExamples").checked,
      show_diagrams: $("showDiagrams").checked,
      show_formulas: $("showFormulas").checked,
      suggest_follow_ups: $("suggestFollowUps").checked,
      quick_answers: $("quickAnswers").checked,
      language: $("responseLanguage").value || "auto",
      voice_language: $("voiceLanguage").value || "auto",
      voice_intelligence: $("voiceIntelligence").value || "standard"
    };
  }

  async function renderVoices() {
    const grid = $("voiceGrid");
    try {
      const voices = await VoiceConfig.ready();
      const backendPreference = Auth?.getSessionToken?.() ? await Auth.getVoicePreferences().catch(() => null) : null;
      const preferred = VoiceConfig.normalizeVoice(backendPreference?.preferred_voice_agent) || VoiceConfig.getVoice()?.key || voices[0]?.key;
      grid.replaceChildren(...voices.map((voice) => {
        const label = document.createElement("label");
        label.className = "voice-card";
        label.style.setProperty("--voice-a", voice.colors[0] || "#347cff");
        label.style.setProperty("--voice-b", voice.colors[1] || "#7a5cff");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "preferredVoice";
        input.value = voice.key;
        input.checked = voice.key === preferred;
        const body = document.createElement("span");
        const orb = document.createElement("i");
        orb.className = "voice-orb";
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = voice.name;
        const description = document.createElement("small");
        description.textContent = voice.description;
        copy.append(name, description);
        body.append(orb, copy);
        label.append(input, body);
        return label;
      }));
    } catch (_error) {
      grid.innerHTML = '<p class="loading-copy">Tutorly voices are temporarily unavailable. Voice Chat itself is unchanged.</p>';
    }
  }

  function openSection(section, options = {}) {
    const target = VALID_SECTIONS.has(section) ? section : "profile";
    document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
      const active = panel.dataset.settingsPanel === target;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-settings-target]").forEach((button) => {
      const active = button.dataset.settingsTarget === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    $("settingsSectionSelect").value = target;
    if (options.hash !== false) history.replaceState({}, "", `#${target}`);
    if (options.scroll) document.querySelector(".settings-layout")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setEditMode(editing) {
    $("profileReadonly").hidden = editing;
    $("profileForm").hidden = !editing;
    if (editing) $("nameInput").focus();
  }

  async function loadBackendProfile() {
    const request = ++profileRequest;
    const token = Auth?.getSessionToken?.();
    showSession(token ? "loading" : "signed_out");
    if (!token) return;
    try {
      const payload = await Auth.currentUser();
      if (request !== profileRequest || token !== Auth.getSessionToken()) return;
      if (payload?.authenticated !== true) { handleSessionError({ status: 401 }); return; }
      const user = payload.user;
      if (!user?.id || !user.email) throw new Error("No verified account details were returned. Please retry.");
      if (payload.onboarding_required) { showSession("onboarding", "Complete your Tutorly profile before opening account settings."); return; }
      state.profile = {
        name: user.full_name || "Your account", email: user.email, username: user.username,
        role: user.role || "student", age: user.age || "", teacher: user.teacher_profile,
        grade: user.grade || "",
        board: user.board || "",
        school: user.school || "",
        avatar: user.avatar_url || localStorage.getItem("tutorly_avatar") || ""
      };
      state.personalization = { ...DEFAULTS, ...(user.personalization || {}) };
      state.subscription = readSubscription(payload);
      localStorage.setItem("tutorly_name", state.profile.name);
      localStorage.setItem("math-bot-name", state.profile.name);
      localStorage.setItem("tutorly_email", state.profile.email);
      localStorage.setItem("tutorly_grade", state.profile.grade);
      localStorage.setItem("tutorly_board", state.profile.board);
      localStorage.setItem("tutorly_school", state.profile.school);
      renderProfile();
      renderPersonalization();
      renderSubscription();
      renderActivity();
      showSession("authenticated");
      await renderVoices();
    } catch (error) {
      if (request !== profileRequest || token !== Auth.getSessionToken()) return;
      if (!handleSessionError(error)) showSession("error", "Tutorly couldn't reach your account. Retry or sign in again. Account details are hidden until your session is confirmed.");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (state.authStatus !== "authenticated" || !Auth?.getSessionToken?.()) {
      toast("Log in to save your profile.", "error");
      return;
    }
    const next = {
      ...state.profile,
      name: $("nameInput").value.trim(), email: state.profile.email,
      age: $("ageInput").value,
      grade: $("gradeInput").value.trim(), board: $("boardInput").value.trim(),
      school: $("schoolInput").value.trim(), avatar: state.profile.avatar
    };
    try {
      const previousCurriculum = { board: state.profile.board, grade: state.profile.grade };
      if (state.profile.role === "teacher") await Auth.updateTeacherProfile({ full_name: next.name });
      else await Auth.updateProfile({ fullName: next.name, age: next.age, grade: next.grade, board: next.board, school: next.school });
      state.profile = next;
      localStorage.setItem("tutorly_name", next.name);
      localStorage.setItem("math-bot-name", next.name);
      localStorage.setItem("tutorly_signup_full_name", next.name);
      localStorage.setItem("tutorly_grade", next.grade);
      localStorage.setItem("tutorly_board", next.board);
      localStorage.setItem("tutorly_school", next.school);
      if (next.age) localStorage.setItem("tutorly_age", next.age);
      window.TutorlyCurriculum?.invalidateProfileChange?.(previousCurriculum, next);
      renderProfile();
      setEditMode(false);
      toast("Profile saved.");
    } catch (error) {
      handleSessionError(error);
      toast(error.message || "Profile could not be saved.", "error");
    }
  }

  async function savePersonalization(event) {
    event.preventDefault();
    if (state.authStatus !== "authenticated" || !Auth?.getSessionToken?.()) {
      toast("Log in to save personalization.", "error");
      return;
    }
    try {
      const payload = await Auth.savePersonalization(formPreferences());
      state.personalization = { ...DEFAULTS, ...payload.personalization };
      renderPersonalization();
      toast("Personalization saved. New chats will use it.");
    } catch (error) {
      handleSessionError(error);
      toast(error.message || "Personalization could not be saved.", "error");
    }
  }

  async function saveVoice(event) {
    event.preventDefault();
    const voiceKey = document.querySelector('input[name="preferredVoice"]:checked')?.value || "";
    if (!voiceKey) {
      toast("Choose a Tutorly voice first.", "error");
      return;
    }
    if (state.authStatus !== "authenticated" || !Auth?.getSessionToken?.()) {
      toast("Log in to save voice settings.", "error");
      return;
    }
    try {
      await Auth.saveVoicePreferences(voiceKey, true);
      VoiceConfig.saveLocalPreference(voiceKey, true);
      VoiceConfig.saveIntelligence($("voiceIntelligence").value);
      localStorage.setItem("tutorly_voice_language", $("voiceLanguage").value);
      state.personalization = { ...state.personalization, voice_language: $("voiceLanguage").value, voice_intelligence: $("voiceIntelligence").value };
      await Auth.savePersonalization(state.personalization);
      toast("Voice settings saved.");
    } catch (error) {
      handleSessionError(error);
      toast(error.message || "Voice settings could not be saved.", "error");
    }
  }

  function syncTheme() {
    const saved = localStorage.getItem("tutorly_theme");
    const theme = saved === "dark" || saved === "light" ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function bind() {
    $("profileSessionRetry").addEventListener("click", loadBackendProfile);
    root.addEventListener("storage", (event) => {
      if (event.key === "tutorly_session_token" || event.key === null) loadBackendProfile();
    });
    // Revalidate after returning to an open Profile tab, including an expired session.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") loadBackendProfile();
    });
    document.querySelectorAll("[data-settings-target]").forEach((button) => button.addEventListener("click", () => openSection(button.dataset.settingsTarget)));
    $("settingsSectionSelect").addEventListener("change", (event) => openSection(event.target.value, { scroll: true }));
    $("editProfileBtn").addEventListener("click", () => { openSection("profile", { scroll: true }); setEditMode(true); });
    $("cancelProfileEdit").addEventListener("click", () => { renderProfile(); setEditMode(false); });
    $("profileForm").addEventListener("submit", saveProfile);
    $("personalizationForm").addEventListener("submit", savePersonalization);
    $("voiceForm").addEventListener("submit", saveVoice);
    $("avatarInput").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type) || file.size > 3 * 1024 * 1024) {
        toast("Choose a PNG, JPG or WebP image under 3 MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.profile.avatar = String(reader.result || "");
        localStorage.setItem("tutorly_avatar", state.profile.avatar);
        renderProfile();
      };
      reader.readAsDataURL(file);
    });
    $("logoutBtn").addEventListener("click", async () => {
      if (!root.confirm("Log out of Tutorly?")) return;
      await Auth?.logout?.();
      root.location.href = "maths_gpt.html";
    });
    const connectedCard = document.querySelector("[data-connected-accounts-card]");
    if (connectedCard) new MutationObserver(() => { $("securityEmpty").hidden = !connectedCard.hidden; }).observe(connectedCard, { attributes: true, attributeFilter: ["hidden"] });
  }

  async function init() {
    $("gradeInput").replaceChildren(...Array.from({ length: 12 }, (_, i) => {
      const option = document.createElement("option"); option.value = String(i + 1); option.textContent = `Grade ${i + 1}`; return option;
    }));
    populateLanguages();
    syncTheme();
    bind();
    openSection(location.hash.slice(1), { hash: false });
    await loadBackendProfile();
    if (state.authStatus === "authenticated" && state.profile.role !== "teacher") {
      try {
        const registry = await root.TutorlyEducation.load();
        boardPicker = root.TutorlyEducationSelect.mount($("profileBoardSelect"), {
          id: "profileBoard", label: "Board", items: registry.boards, value: state.profile.board,
          onChange(_value, items) { $("boardInput").value = items[0]?.curriculumValue || items[0]?.id || ""; }
        });
        $("boardInput").hidden = true; $("boardInput").required = false; $("boardFallbackLabel").hidden = true;
      } catch (_error) { /* Keep the labelled Board field usable if registry loading fails. */ }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
