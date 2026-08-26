(function (root) {
  "use strict";

  const VOICES = [];
  const REGISTRY_URL = "shared/tutorly-voice-agents.json";
  const ALLOWED_KEYS = Object.freeze(["miles", "theo", "leo", "ethan", "aria", "clara", "luna", "nova"]);

  const INTELLIGENCE = Object.freeze([
    Object.freeze({ key: "standard", label: "Standard", model: "prime" }),
    Object.freeze({ key: "deep", label: "Deep Solve", model: "deep", creditAction: "deepSolve" })
  ]);

  const STORAGE_KEYS = Object.freeze({
    voice: "tutorly_preferred_voice_agent",
    onboarding: "tutorly_voice_onboarding_completed",
    intelligence: "tutorly_voice_intelligence"
  });

  let registryPromise = null;

  function validateRegistry(payload) {
    const entries = Array.isArray(payload?.voices) ? payload.voices : [];
    if (entries.length !== ALLOWED_KEYS.length) throw new Error("voice_registry_invalid");
    return entries.map((entry, index) => {
      const key = String(entry?.key || "").trim().toLowerCase();
      const agentId = String(entry?.agentId || "").trim();
      if (key !== ALLOWED_KEYS[index] || !/^agent_[a-z0-9]+$/.test(agentId)) {
        throw new Error("voice_registry_invalid");
      }
      return Object.freeze({
        key,
        name: String(entry.name || "").trim(),
        description: String(entry.description || "").trim(),
        agentId,
        genderGroup: entry.genderGroup === "girl" ? "girl" : "boy",
        colors: Object.freeze(Array.isArray(entry.colors) ? entry.colors.slice(0, 3) : [])
      });
    });
  }

  function ready() {
    if (VOICES.length) return Promise.resolve(VOICES);
    if (registryPromise) return registryPromise;
    registryPromise = fetch(REGISTRY_URL, { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error("voice_registry_unavailable");
        return response.json();
      })
      .then((payload) => {
        VOICES.splice(0, VOICES.length, ...validateRegistry(payload));
        return VOICES;
      })
      .catch((error) => {
        registryPromise = null;
        throw error;
      });
    return registryPromise;
  }

  function safeStoredValue(key, fallback) {
    try { return String(root.localStorage?.getItem(key) || fallback); }
    catch (_error) { return fallback; }
  }

  function normalizeVoice(value) {
    const key = String(value || "").trim().toLowerCase();
    return VOICES.some((voice) => voice.key === key) ? key : "";
  }

  function normalizeIntelligence(value) {
    const key = String(value || "").trim().toLowerCase();
    return INTELLIGENCE.some((mode) => mode.key === key) ? key : INTELLIGENCE[0].key;
  }

  function getVoice(key = safeStoredValue(STORAGE_KEYS.voice, "")) {
    const safeKey = normalizeVoice(key);
    return VOICES.find((voice) => voice.key === safeKey) || null;
  }

  function getIntelligence(key = safeStoredValue(STORAGE_KEYS.intelligence, INTELLIGENCE[0].key)) {
    const safeKey = normalizeIntelligence(key);
    return INTELLIGENCE.find((mode) => mode.key === safeKey) || INTELLIGENCE[0];
  }

  function saveVoice(value) {
    const key = normalizeVoice(value);
    if (!key) return null;
    try { root.localStorage?.setItem(STORAGE_KEYS.voice, key); } catch (_error) {}
    return getVoice(key);
  }

  function getLocalPreference() {
    const voice = getVoice();
    const completed = safeStoredValue(STORAGE_KEYS.onboarding, "false") === "true";
    return { preferred_voice_agent: voice?.key || "", voice_onboarding_completed: completed && !!voice };
  }

  function saveLocalPreference(value, completed = true) {
    const voice = saveVoice(value);
    if (!voice) return getLocalPreference();
    try { root.localStorage?.setItem(STORAGE_KEYS.onboarding, completed ? "true" : "false"); } catch (_error) {}
    return getLocalPreference();
  }

  function saveIntelligence(value) {
    const key = normalizeIntelligence(value);
    try { root.localStorage?.setItem(STORAGE_KEYS.intelligence, key); } catch (_error) {}
    return getIntelligence(key);
  }

  root.TutorlyVoiceConfig = Object.freeze({
    VOICES,
    ALLOWED_KEYS,
    REGISTRY_URL,
    INTELLIGENCE,
    STORAGE_KEYS,
    ready,
    normalizeVoice,
    normalizeIntelligence,
    getVoice,
    getLocalPreference,
    saveLocalPreference,
    getIntelligence,
    saveVoice,
    saveIntelligence
  });
})(window);
