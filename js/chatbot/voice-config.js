(function (root) {
  "use strict";

  const VOICES = Object.freeze([
    Object.freeze({ key: "miles", name: "Miles", description: "Calm, intelligent and precise", agentId: null, colors: ["#2377ff", "#694cff", "#25c6ff"] }),
    Object.freeze({ key: "theo", name: "Theo", description: "Friendly, clear and relaxed", agentId: null, colors: ["#3a86ff", "#5874ed", "#35d4c8"] }),
    Object.freeze({ key: "leo", name: "Leo", description: "Bright, energetic and expressive", agentId: null, colors: ["#3478ff", "#a347ff", "#40d7ff"] }),
    Object.freeze({ key: "evan", name: "Evan", description: "Soft, patient and reassuring", agentId: null, colors: ["#4669db", "#7864ef", "#62b8ff"] }),
    Object.freeze({ key: "aria", name: "Aria", description: "Warm, natural and friendly", agentId: null, colors: ["#456dff", "#9a53ea", "#56d4ef"] }),
    Object.freeze({ key: "clara", name: "Clara", description: "Clear, confident and composed", agentId: null, colors: ["#2f7bff", "#6256d9", "#66d7ff"] }),
    Object.freeze({ key: "luna", name: "Luna", description: "Gentle, calm and soothing", agentId: null, colors: ["#4f67d8", "#8d5cea", "#72c8ff"] }),
    Object.freeze({ key: "nova", name: "Nova", description: "Lively, upbeat and expressive", agentId: null, colors: ["#1f8aff", "#a443ff", "#1ed7e7"] })
  ]);

  const INTELLIGENCE = Object.freeze([
    Object.freeze({ key: "standard", label: "Standard", model: "prime" }),
    Object.freeze({ key: "deep", label: "Deep Solve", model: "deep", creditAction: "deepSolve" })
  ]);

  const STORAGE_KEYS = Object.freeze({
    voice: "tutorly_voice_personality",
    intelligence: "tutorly_voice_intelligence"
  });

  function safeStoredValue(key, fallback) {
    try { return String(root.localStorage?.getItem(key) || fallback); }
    catch (_error) { return fallback; }
  }

  function normalizeVoice(value) {
    const key = String(value || "").trim().toLowerCase();
    return VOICES.some((voice) => voice.key === key) ? key : VOICES[0].key;
  }

  function normalizeIntelligence(value) {
    const key = String(value || "").trim().toLowerCase();
    return INTELLIGENCE.some((mode) => mode.key === key) ? key : INTELLIGENCE[0].key;
  }

  function getVoice(key = safeStoredValue(STORAGE_KEYS.voice, VOICES[0].key)) {
    const safeKey = normalizeVoice(key);
    return VOICES.find((voice) => voice.key === safeKey) || VOICES[0];
  }

  function getIntelligence(key = safeStoredValue(STORAGE_KEYS.intelligence, INTELLIGENCE[0].key)) {
    const safeKey = normalizeIntelligence(key);
    return INTELLIGENCE.find((mode) => mode.key === safeKey) || INTELLIGENCE[0];
  }

  function saveVoice(value) {
    const key = normalizeVoice(value);
    try { root.localStorage?.setItem(STORAGE_KEYS.voice, key); } catch (_error) {}
    return getVoice(key);
  }

  function saveIntelligence(value) {
    const key = normalizeIntelligence(value);
    try { root.localStorage?.setItem(STORAGE_KEYS.intelligence, key); } catch (_error) {}
    return getIntelligence(key);
  }

  // Agent IDs intentionally remain null until Tutorly's eight production agents exist.
  // The current live ElevenLabs agent continues to be resolved by the existing backend/adapter.
  root.TutorlyVoiceConfig = Object.freeze({
    VOICES,
    INTELLIGENCE,
    STORAGE_KEYS,
    normalizeVoice,
    normalizeIntelligence,
    getVoice,
    getIntelligence,
    saveVoice,
    saveIntelligence
  });
})(window);
