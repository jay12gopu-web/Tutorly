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
  const state = {
    profile: {
      name: localStorage.getItem("tutorly_name") || localStorage.getItem("math-bot-name") || localStorage.getItem("tutorly_signup_full_name") || "Student",
      email: localStorage.getItem("tutorly_email") || localStorage.getItem("tutorly_signup_email") || "",
      grade: localStorage.getItem("tutorly_grade") || "",
      board: localStorage.getItem("tutorly_board") || "",
      school: localStorage.getItem("tutorly_school") || "",
      avatar: localStorage.getItem("tutorly_avatar") || ""
    },
    personalization: { ...DEFAULTS, ...readJson("tutorly_personalization", {}) },
    subscription: readSubscription()
  };

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function readSubscription() {
    const saved = readJson("tutorly_subscription", {});
    const storedPlan = saved.currentPlan || localStorage.getItem("tutorly_current_plan") || "standard";
    const plan = Plans?.getPlan?.(storedPlan) || { id: "standard", name: "Standard", premium: false, monthlyPremiumCredits: 100 };
    const allowance = Number.isFinite(Number(saved.creditAllowance)) ? Math.max(0, Number(saved.creditAllowance)) : plan.monthlyPremiumCredits;
    const remaining = Number.isFinite(Number(saved.premiumCreditsRemaining)) ? Math.min(allowance, Math.max(0, Number(saved.premiumCreditsRemaining))) : allowance;
    return { ...saved, plan, allowance, remaining };
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
    const explicit = localStorage.getItem("tutorly_username");
    if (explicit) return explicit.replace(/^@/, "");
    const emailName = String(state.profile.email || "").split("@")[0].replace(/[^a-z0-9._-]/gi, "");
    const name = String(state.profile.name || "student").toLowerCase().replace(/[^a-z0-9]/g, "");
    return emailName || name || "student";
  }

  function renderProfile() {
    const profile = state.profile;
    const initial = String(profile.name || "Student").trim().charAt(0).toUpperCase() || "S";
    $("profileTitle").textContent = profile.name || "Student";
    $("profileUsername").textContent = `@${safeUsername()}`;
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
    $("nameInput").value = profile.name || "";
    $("emailInput").value = profile.email || "";
    $("gradeInput").value = profile.grade || "";
    $("boardInput").value = profile.board || "";
    $("schoolInput").value = profile.school || "";
  }

  function renderSubscription() {
    state.subscription = readSubscription();
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
    const current = Math.max(summary.current, savedStreak);
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
    if (!Auth?.getSessionToken?.()) return;
    try {
      const payload = await Auth.currentUser();
      const user = payload.user || {};
      state.profile = {
        ...state.profile,
        name: user.full_name || state.profile.name,
        email: user.email || state.profile.email,
        grade: user.grade || state.profile.grade,
        board: user.board || state.profile.board,
        school: typeof user.school === "string" ? user.school : state.profile.school,
        avatar: state.profile.avatar || user.avatar_url || ""
      };
      if (user.personalization) state.personalization = { ...DEFAULTS, ...user.personalization };
      localStorage.setItem("tutorly_name", state.profile.name);
      localStorage.setItem("math-bot-name", state.profile.name);
      localStorage.setItem("tutorly_email", state.profile.email);
      localStorage.setItem("tutorly_grade", state.profile.grade);
      localStorage.setItem("tutorly_board", state.profile.board);
      localStorage.setItem("tutorly_school", state.profile.school);
      renderProfile();
      renderPersonalization();
    } catch (error) {
      toast(error.message || "Tutorly could not refresh your account.", "error");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!Auth?.getSessionToken?.()) {
      toast("Log in to save your profile.", "error");
      return;
    }
    const next = {
      name: $("nameInput").value.trim(), email: state.profile.email,
      grade: $("gradeInput").value.trim(), board: $("boardInput").value.trim(),
      school: $("schoolInput").value.trim(), avatar: state.profile.avatar
    };
    try {
      await Auth.updateProfile({ fullName: next.name, grade: next.grade, board: next.board, school: next.school });
      state.profile = next;
      localStorage.setItem("tutorly_name", next.name);
      localStorage.setItem("math-bot-name", next.name);
      localStorage.setItem("tutorly_signup_full_name", next.name);
      localStorage.setItem("tutorly_grade", next.grade);
      localStorage.setItem("tutorly_board", next.board);
      localStorage.setItem("tutorly_school", next.school);
      renderProfile();
      setEditMode(false);
      toast("Profile saved.");
    } catch (error) {
      toast(error.message || "Profile could not be saved.", "error");
    }
  }

  async function savePersonalization(event) {
    event.preventDefault();
    if (!Auth?.getSessionToken?.()) {
      toast("Log in to save personalization.", "error");
      return;
    }
    try {
      const payload = await Auth.savePersonalization(formPreferences());
      state.personalization = { ...DEFAULTS, ...payload.personalization };
      renderPersonalization();
      toast("Personalization saved. New chats will use it.");
    } catch (error) {
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
    if (!Auth?.getSessionToken?.()) {
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
    populateLanguages();
    renderProfile();
    renderSubscription();
    renderActivity();
    renderPersonalization();
    syncTheme();
    bind();
    openSection(location.hash.slice(1), { hash: false });
    await Promise.allSettled([loadBackendProfile(), renderVoices()]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
