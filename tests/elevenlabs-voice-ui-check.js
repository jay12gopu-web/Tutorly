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

assert(html.includes('id="speechTextBtn"'), "Speech-to-text must remain a separate control");
assert(html.includes('id="voiceBtn"'), "The existing headset Voice Chat control must remain");
assert(html.indexOf("js/chatbot/elevenlabs-voice.js") < html.indexOf("js/chatbot/voice-chat.js"));
assert(html.indexOf("js/chatbot/voice-config.js") < html.indexOf("js/chatbot/voice-chat.js"));
assert(html.includes('id="voiceSessionMute"'), "The immersive call must have a dedicated microphone mute control");
assert(html.includes('id="voiceSettingsOpen"') && html.includes('id="voiceSettingsBackdrop"'));
assert(html.includes('id="voiceSettingsClose"'), "Settings must have its own non-call-ending close button");
assert(html.includes('id="voiceSelectorPrevious"') && html.includes('id="voiceSelectorNext"'));
assert(html.includes('id="voiceIntelligenceSelect"') && html.includes('id="voiceSessionLanguage"'));
assert(html.includes('id="voiceSessionRetry"') && html.includes('id="voiceSessionEnableMic"'));

assert(adapter.includes('connectionType: "webrtc"'));
assert(adapter.includes("conversationToken"));
assert(adapter.includes("agent_0201m0wydx9bft0tn09q0ex0ghm0"), "The requested public ElevenLabs agent must be the direct fallback");
assert(adapter.includes("js/vendor/elevenlabs-client.js"), "The locally hosted SDK must be loaded on demand");
assert(adapter.includes("TutorlyAuth?.getSessionToken"));
assert(!adapter.includes("ELEVENLABS_API_KEY"), "Provider secrets must never appear in frontend JavaScript");
assert.equal((config.match(/agentId: null/g) || []).length, 8, "All future voice IDs must remain deliberately unconfigured");
assert(!config.includes("agent_"), "Future voice configuration must not invent ElevenLabs agent IDs");
["miles", "theo", "leo", "evan", "aria", "clara", "luna", "nova"].forEach((voice) => {
  assert(config.includes(`key: "${voice}"`), `Voice configuration must include ${voice}`);
});
assert(controller.includes("TutorlyElevenLabsVoice?.start"));
assert(controller.includes("stopProviderSession()"), "Closing Voice Chat must stop the provider session");
assert(controller.includes("providerSession?.setMicMuted?.(muted)"), "Mute must use the live provider microphone control");
assert(controller.includes("track.enabled = !muted"), "Fallback Voice Chat must mute only its microphone track");
assert(controller.includes('setState("muted")'));
assert(controller.includes('event.key === "Escape"') && controller.includes("setSettingsOpen(false)"));
assert(controller.includes("event.target === settingsBackdrop"));
assert(controller.includes("retrySession"));
assert(styles.includes("#040916") && styles.includes(".voice-session-control-pill"));
assert(styles.includes('[data-voice-state="user-speaking"]'));
assert(styles.includes('[data-voice-state="muted"]'));
assert(styles.includes("prefers-reduced-motion: reduce"));
assert(app.includes('getBackendEndpoint("/api/voice/session")'));
assert(app.includes('source: "elevenlabs_voice"'), "Voice turns must use existing Tutorly chat history");

console.log("Tutorly ElevenLabs Voice Chat UI integration checks passed.");
