const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "maths_gpt.html"), "utf8");
const adapter = fs.readFileSync(path.join(root, "js", "chatbot", "elevenlabs-voice.js"), "utf8");
const config = fs.readFileSync(path.join(root, "js", "chatbot", "voice-config.js"), "utf8");
const controller = fs.readFileSync(path.join(root, "js", "chatbot", "voice-chat.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "voice-chat.css"), "utf8");
const registry = JSON.parse(fs.readFileSync(path.join(root, "shared", "tutorly-voice-agents.json"), "utf8"));

assert(html.includes('id="speechTextBtn"'), "Speech-to-text must remain a separate control");
assert(html.includes('id="voiceBtn"'), "The existing headset Voice Chat control must remain");
assert(html.indexOf("js/chatbot/elevenlabs-voice.js") < html.indexOf("js/chatbot/voice-chat.js"));
assert(html.indexOf("js/chatbot/voice-config.js") < html.indexOf("js/chatbot/voice-chat.js"));
assert(html.includes('id="voiceSessionMute"'), "The immersive call must have a dedicated microphone mute control");
assert(html.includes('id="voiceSettingsOpen"') && html.includes('id="voiceSettingsBackdrop"'));
assert(html.includes('id="voiceSettingsClose"'), "Settings must have its own non-call-ending close button");
assert(html.includes('id="voiceSettingsSave"'), "Voice Settings must require an explicit Save Changes action");
assert(html.includes('id="voiceSelectorPrevious"') && html.includes('id="voiceSelectorNext"'));
assert(html.includes('id="voiceIntelligenceSelect"') && html.includes('id="voiceSessionLanguage"'));
assert(html.includes('id="voiceSessionRetry"') && html.includes('id="voiceSessionEnableMic"'));
assert(html.includes('id="voiceOnboardingModal"') && html.includes('id="voiceOnboardingGrid"'));
assert(html.includes('id="voiceOnboardingContinue"') && html.includes('id="voiceOnboardingExit"'));

assert(adapter.includes('connectionType: "webrtc"'));
assert(adapter.includes("conversationToken"));
assert(adapter.includes("JSON.stringify({ voice: voiceKey })"), "The client must request tokens by approved voice key");
assert(adapter.includes("selectedAgentId"), "Public agents may use the selected registry agent directly");
assert(adapter.includes("js/vendor/elevenlabs-client.js"), "The locally hosted SDK must be loaded on demand");
assert(adapter.includes("TutorlyAuth?.getSessionToken"));
assert(!adapter.includes("ELEVENLABS_API_KEY"), "Provider secrets must never appear in frontend JavaScript");
assert.equal(registry.voices.length, 8);
const expected = {
  miles: "agent_3501m0yj8ngff3vtgr1bgxjvsyqt",
  theo: "agent_2101m0ykd29nekysy1mr97dmzawb",
  leo: "agent_2801m0ykmd19fjyt6nx3cdrw9qva",
  ethan: "agent_5001m0ykrb2cfghb1f6jzaw4b103",
  aria: "agent_2201m0ykz0mke59aqy8emera0ms9",
  clara: "agent_6401m0ym3vdgefyrm47g997bgeve",
  luna: "agent_8101m0ymkf8bebf8b6ne3ja8zkqk",
  nova: "agent_7101m0ymxhh0eq0aqczv11atjf16"
};
assert.deepEqual(Object.fromEntries(registry.voices.map((voice) => [voice.key, voice.agentId])), expected);
assert(config.includes("tutorly-voice-agents.json") && config.includes("voice_onboarding_completed"));
assert(controller.includes("TutorlyElevenLabsVoice?.start"));
assert(controller.includes("stopProviderSession()"), "Closing Voice Chat must stop the provider session");
assert(controller.includes("providerSession?.setMicMuted?.(muted)"), "Mute must use the live provider microphone control");
assert(controller.includes("track.enabled = !muted"), "Fallback Voice Chat must mute only its microphone track");
assert(controller.includes('setState("muted")'));
assert(controller.includes('event.key === "Escape"') && controller.includes("setSettingsOpen(false)"));
assert(controller.includes("event.target === settingsBackdrop"));
assert(controller.includes("retrySession"));
assert(controller.includes("setOnboardingOpen(true)"));
assert(controller.includes("continueVoiceOnboarding"));
assert(controller.includes("saveSettingsChanges"));
assert(controller.includes("markSettingsDirty"));
assert(controller.includes("settingsSaveButton?.addEventListener(\"click\", saveSettingsChanges)"));
assert(controller.includes("voice_onboarding_completed"));
assert(controller.indexOf("setOnboardingOpen(true)") < controller.lastIndexOf("startVoiceTransport()"), "The chooser must be resolved before the microphone/provider starts");
assert(styles.includes("#040916") && styles.includes(".voice-session-control-pill"));
assert(styles.includes(".voice-onboarding-modal") && styles.includes(".voice-onboarding-card"));
assert(styles.includes(".voice-settings-save"));
assert(styles.includes('[data-voice-state="user-speaking"]'));
assert(styles.includes('[data-voice-state="muted"]'));
assert(styles.includes("prefers-reduced-motion: reduce"));
assert(app.includes('getBackendEndpoint("/api/voice/session")'));
assert(app.includes("getVoicePreferences") && app.includes("saveVoicePreferences"));
assert(app.includes('source: "elevenlabs_voice"'), "Voice turns must use existing Tutorly chat history");

console.log("Tutorly ElevenLabs Voice Chat UI integration checks passed.");
