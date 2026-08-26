const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "maths_gpt.html"), "utf8");
const adapter = fs.readFileSync(path.join(root, "js", "chatbot", "elevenlabs-voice.js"), "utf8");
const controller = fs.readFileSync(path.join(root, "js", "chatbot", "voice-chat.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");

assert(html.includes('id="speechTextBtn"'), "Speech-to-text must remain a separate control");
assert(html.includes('id="voiceBtn"'), "The existing headset Voice Chat control must remain");
assert(html.indexOf("js/chatbot/elevenlabs-voice.js") < html.indexOf("js/chatbot/voice-chat.js"));

assert(adapter.includes('connectionType: "webrtc"'));
assert(adapter.includes("conversationToken"));
assert(adapter.includes("agent_0201m0wydx9bft0tn09q0ex0ghm0"), "The requested public ElevenLabs agent must be the direct fallback");
assert(adapter.includes("js/vendor/elevenlabs-client.js"), "The locally hosted SDK must be loaded on demand");
assert(adapter.includes("TutorlyAuth?.getSessionToken"));
assert(!adapter.includes("ELEVENLABS_API_KEY"), "Provider secrets must never appear in frontend JavaScript");
assert(controller.includes("TutorlyElevenLabsVoice?.start"));
assert(controller.includes("stopProviderSession()"), "Closing Voice Chat must stop the provider session");
assert(app.includes('getBackendEndpoint("/api/voice/session")'));
assert(app.includes('source: "elevenlabs_voice"'), "Voice turns must use existing Tutorly chat history");

console.log("Tutorly ElevenLabs Voice Chat UI integration checks passed.");
