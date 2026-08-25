const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const page = read("maths_gpt.html");
const app = read("js/app.js");
const chatbotCss = read("css/chatbot.css");
const chatHistorySource = read("js/chatbot/chat-history-store.js");
const gptSource = read("js/gpt.js");
const moreToolsPage = read("more-tools.html");
const policySource = read("js/chatbot/response-policy.js");
const visuals = read("js/chatbot/educational-visuals.js");
const voiceSource = read("js/chatbot/voice-chat.js");
const reasoningStatusSource = read("js/chatbot/reasoning-status.js");

[
  "js/chatbot/chatbot-core.js",
  "js/chatbot/mode-registry.js",
  "js/chatbot/chat-history-store.js",
  "js/chatbot/learning-tools.js",
  "js/chatbot/response-policy.js",
  "js/chatbot/educational-visuals.js",
  "js/chatbot/reasoning-status.js",
  "js/chatbot/rich-response-renderer.js",
  "js/chatbot/markdown-renderer.js",
  "js/chatbot/voice-chat.js",
  "js/app.js"
].forEach((script) => {
  assert.ok(page.includes(`src="${script}`), `maths_gpt.html should load ${script}`);
});

[
  "chat-memory.js",
  "adaptive-intelligence.js",
  "response-engine.js",
  "gpt.js",
  "response-contract.js",
  "math-response-contract.js",
  "advanced-math-engine.js",
  "geography-visuals.js",
  "english-engine.js"
].forEach((script) => {
  assert.ok(!page.includes(`src="js/${script}"`) && !page.includes(`src="js/chatbot/${script}"`),
    `${script} must remain disabled on the live chat page`);
});

assert.ok(app.includes('getBackendEndpoint("/api/chat")'), "frontend should call the backend semantic chat endpoint");
assert.ok(app.includes('return "https://tutorly-api.onrender.com"'), "production chat should use the deployed Tutorly API");
assert.ok(app.includes("activity_chat_id"), "frontend should retain the persisted chat id for feedback");
assert.ok(app.includes("semanticRoute"), "frontend should consume validated semantic route metadata");
assert.ok(app.includes("fromSemanticRoute"), "visual rendering should use semantic route output");
assert.ok(app.includes("chatRequestInFlight"), "send button should suppress duplicate in-flight requests");
assert.ok(app.includes("const ENABLE_LEGACY_LOCAL_ROUTER = false"), "legacy local keyword router should be explicitly disabled");
assert.ok(app.includes("placeSemanticVisual"), "frontend should honor semantic visual placement");
assert.ok(app.includes("renderMarkdownNote"), "existing Markdown renderer should be reused");
assert.ok(app.includes("markdown-table-wrap"), "Markdown tables should be supported");
assert.ok(app.includes("<pre${language}><code>"), "fenced code blocks should be supported");
assert.ok(app.includes("renderDisplayMath"), "inline and multiline display math should be supported");
assert.ok(app.includes("RichResponse?.hydrate?.(content)"), "rich response blocks should hydrate inside existing messages");
assert.ok(app.includes("MarkdownRenderer.render(markdown"), "chat should use the shared failure-isolated Markdown renderer");
assert.ok(app.includes("text.match(/[\\s\\S]{1,42}/g)"), "simulated streaming must preserve every response character");
assert.ok(app.includes("ReasoningStatus?.stop?.(message)"), "visible answer streaming should stop the reasoning status immediately");
assert.ok(app.includes("ReasoningStatus?.stopAll?.()"), "request cancellation should clear every reasoning-status timer");
assert.ok(app.includes("pendingChatStartTimer"), "new-chat cancellation should clear delayed request startup");
assert.ok(chatbotCss.includes(".reasoning-status-visual.is-changing"), "reasoning words should use a subtle fade transition");
assert.ok(chatbotCss.includes("prefers-reduced-motion: reduce"), "reasoning status motion should respect reduced-motion preferences");
assert.ok(!app.includes("Tutorly is thinking") && !reasoningStatusSource.includes("Tutorly is thinking"), "the live chat must not show the old generic thinking phrase");

const reasoningSandbox = { window: {} };
vm.runInNewContext(reasoningStatusSource, reasoningSandbox);
const reasoningStatus = reasoningSandbox.window.TutorlyReasoningStatus;
assert.deepStrictEqual(Array.from(reasoningStatus.sequenceFor({ subject: "mathematics" })), ["Analyzing", "Formulating", "Verifying", "Refining"]);
assert.deepStrictEqual(Array.from(reasoningStatus.sequenceFor({ subject: "english", intent: "writing_help" })), ["Interpreting", "Structuring", "Refining", "Reviewing"]);
assert.deepStrictEqual(Array.from(reasoningStatus.sequenceFor({ intent: "concept_explanation" })), ["Assessing", "Clarifying", "Structuring", "Refining"]);
assert.deepStrictEqual(Array.from(reasoningStatus.sequenceFor({ model: "deep" })), ["Analyzing", "Evaluating", "Synthesizing", "Verifying"]);
assert.deepStrictEqual(Array.from(reasoningStatus.sequenceFor({ prompt: "Tell me something useful" })), ["Analyzing", "Assessing", "Refining"]);
assert.ok(page.includes('id="voiceChatOverlay"'), "Tutorly should include the full Voice Chat dialog");
assert.ok(page.includes('id="speechTextBtn" class="tool-btn speech-text-btn"'), "speech-to-text should have its own visible composer button");
assert.ok(page.includes('aria-label="Open Tutorly Voice Chat"'), "Voice Chat should have a separate, clearly labelled composer button");
assert.ok(page.includes('class="voice-session-footnote"'), "full Voice Chat should explain the hands-free flow");
assert.ok(app.includes('getBackendEndpoint("/api/transcribe")'), "voice audio should use Tutorly's backend transcription endpoint");
assert.ok(app.includes("voiceSession?.speak"), "full voice mode should speak the concise voice companion");
assert.ok(app.includes("onInterrupt: abortActiveChatRequest"), "barge-in should cancel an active tutor response");
assert.ok(app.includes("streamToken !== activeReplyStreamToken"), "barge-in should also stop the current progressive renderer");
assert.ok(app.includes('speechTextBtn?.addEventListener("click", startDictation)'), "speech-to-text should fill the editable composer independently");
assert.ok(app.includes('voiceSession.open("voice", voiceBtn)'), "the Voice Chat button should open full voice mode directly");
assert.ok(app.includes("inline: false"), "Voice Chat should open the dedicated full-screen experience");
assert.ok(voiceSource.includes("if (!inline)"), "the reusable voice controller should suppress its overlay in inline mode");
assert.ok(app.includes("onStateChange:"), "the composer Voice Chat button should show listening, processing, and speaking states");
assert.ok(page.includes("Voice chat with Tutorly"), "the dedicated Voice Chat page should preserve Tutorly branding");
assert.ok(page.includes('class="voice-session-orb"'), "the dedicated Voice Chat page should include its responsive microphone orb");
assert.ok(voiceSource.includes("const GREETINGS"), "Voice Chat should greet the student verbally when it starts");
assert.ok(voiceSource.includes('speak(mode === "vision"'), "the headset action should begin the spoken conversation after calibration");
assert.ok(voiceSource.includes('utterance.addEventListener("boundary"'), "the microphone orb should pulse gently with Tutorly's spoken cadence");
assert.ok(voiceSource.includes("speakerEchoFloor * 2.15"), "barge-in should distinguish a nearby user from Tutorly's own speaker echo");
assert.ok(app.includes("speechTextBtn.hidden = false"), "speech-to-text should remain visible when the composer contains text");
assert.ok(app.includes("voiceBtn.hidden = !locked && hasReadyContent"), "Voice Chat should be replaced completely when the composer has sendable content");
assert.ok(chatbotCss.includes(".voice-chat-btn[hidden]"), "hidden Voice Chat controls should not occupy composer space on mobile");
assert.ok(!app.includes("openLiveActionSheet") && !app.includes("data-live-mode"), "Voice Chat should not show the old mode picker");
assert.ok(chatbotCss.includes("body.composer-ready #voiceBtn"), "Voice Chat should collapse when the composer is ready to send");
assert.ok(!chatbotCss.replace(/\r\n/g, "\n").includes("body.composer-ready #speechTextBtn,\nbody.composer-ready #voiceBtn"), "speech-to-text should not be replaced by the Send button");
assert.ok(app.includes("voiceMode = !!options.liveMode"), "voice requests should carry backend-only delivery context");
assert.ok(app.includes("const isGuestMode = !isSignedIn"), "logged-out visitors should use the Tutorly chat home in guest mode");
assert.ok(app.includes('topAccountActionLabel.textContent = "Log in"'), "guest mode should replace Upgrade with Log in");
assert.ok(app.includes('showGuestToolNotice(link)'), "guest study tools should show a nearby login notice");
assert.ok(app.includes('window.location.href = "maths_gpt.html"'), "logout should return to the Tutorly chat home");
assert.ok(voiceSource.includes("getFloatFrequencyData"), "voice activity detection should inspect spectral energy");
assert.ok(voiceSource.includes("voiceBandMinHz"), "voice activity detection should focus on the human speech band");
assert.ok(voiceSource.includes("zeroCrossingRate"), "random noise should be filtered using speech-shape features");
assert.ok(voiceSource.includes("minimumVoiceFrames"), "a turn should require sustained voice-like frames");
assert.ok(voiceSource.includes("await calibrate()"), "voice thresholds should calibrate to ambient noise");
assert.ok(voiceSource.includes("speechSynthesis?.cancel"), "closing or interrupting Voice Chat should stop speech output");
assert.ok(voiceSource.includes("getTracks().forEach((track) => track.stop())"), "closing Voice Chat should release microphone tracks");
assert.ok(voiceSource.includes("Auto-detect"), "voice language selection should support safe auto detection");

[
  'id="sidebarRecentChats"',
  'id="sidebarAccountBtn"',
  'id="sidebarAccountMenu"',
  'id="sidebarSignOutBtn"',
  'id="sidebarPlanAction"',
  'id="personalizationBtn"',
  'id="sidebarHelpBtn"',
  'id="keyboardShortcutsBtn"',
  'href="help-center.html"',
  'href="release-notes.html"',
  'href="privacy.html"',
  'href="lessons.html"',
  'href="tests.html"',
  'href="quests.html"',
  'href="more-tools.html"',
  'href="subscriptions.html"',
  'id="confirmOverlay"',
  'id="confirmActionBtn"',
  'id="toolWorkspace"',
  'id="toolFrame"',
  'data-workspace-route="lessons.html"',
  'class="learn-crown side-label"'
].forEach((marker) => assert.ok(page.includes(marker), `chat shell should preserve ${marker}`));
assert.ok(!page.includes('<a class="profile-dot" href="profile.html"'), "the redundant top-right profile avatar should be removed");
assert.ok(!page.includes('id="themeToggle"'), "the top-right theme control should be removed");
assert.ok(!page.includes('id="chatNotificationBtn"'), "the top-right notification control should be removed");
assert.ok(!page.includes('id="sidebarViewAllChats"'), "the redundant view-all-conversations button should be removed");
assert.ok(!page.includes('href="practice.html" title="Practice"'), "Practice should not appear in the compact Study section");
assert.ok(!page.includes('href="progress.html" title="Progress"'), "Progress should not appear in the compact Study section");
assert.ok(app.includes("renderSidebarRecents"), "recent chats should render from the existing conversation store");
assert.ok(app.includes("loadConversation(conversationId)"), "sidebar conversations should reuse the existing loader");
assert.ok(app.includes("openSettingsPanel()"), "account Settings should reuse the existing settings panel");
assert.ok(app.includes("signOutFromTutorly"), "account menu should provide the existing logout behavior");
assert.ok(app.includes('title: "Delete this chat?"'), "chat deletion should require a confirmation dialog");
assert.ok(app.includes('title: "Sign out of Tutorly?"'), "sign out should require a confirmation dialog");
assert.ok(app.includes("function showToolWorkspace"), "study pages should open inside the persistent right-side workspace");
assert.ok(app.includes('toolFrame.addEventListener("load"'), "embedded tool navigation should keep the Tutorly shell synchronized");
assert.ok(app.includes('localStorage.removeItem("tutorly_logged_in")'), "logout should clear the existing authenticated session flag");
assert.ok(app.includes('ChatbotCore?.on?.("history:changed", renderSidebarRecents)'), "recent chats should stay synced with chat history changes");
assert.ok(chatHistorySource.includes("function deleteConversation(id)"), "the shared history module should support permanent chat deletion");
assert.ok(gptSource.includes("deleteConversation,"), "TutorlyGPT should expose shared chat deletion");
assert.ok(chatbotCss.includes(".sidebar-account"), "profile row should be anchored in the sidebar shell");
assert.ok(chatbotCss.includes("text-overflow: ellipsis"), "long conversation titles should be truncated cleanly");
assert.ok(chatbotCss.includes(".chat-shell.sidebar-collapsed"), "desktop collapsed rail styling should exist");
assert.ok(chatbotCss.includes("@media (max-width: 1080px)"), "responsive drawer styling should remain available");
[
  "maths_gpt.html",
  "lessons.html",
  "practice.html",
  "tests.html",
  "quests.html",
  "progress.html",
  "bookmarks.html"
].forEach((route) => assert.ok(moreToolsPage.includes(`href="${route}"`), `More Tools should link to ${route}`));
assert.ok(moreToolsPage.includes('class="tool-learn-crown"'), "More Tools should show the gold crown beside Learn");
assert.ok(page.includes('src="assets/premium-crown.png"'), "premium account and learning controls should use the supplied crown asset");
assert.ok(!page.includes("&#9813;") && !moreToolsPage.includes("&#9813;"), "legacy crown glyphs should be removed");
assert.ok(!page.includes("Download Apps"), "Download Apps must stay hidden until Tutorly is installable");
assert.ok(app.includes("syncAuthoritativeAccount"), "account plan and credit copy should sync with the existing backend guard");

let inMemoryHistoryState = null;
const historyModules = {};
const historyEvents = [];
const historyCore = {
  getModule: (name) => historyModules[name] || null,
  registerModule: (name, module) => { historyModules[name] = module; },
  storage: {
    get: (_key, fallback) => inMemoryHistoryState || fallback,
    set: (_key, value) => { inMemoryHistoryState = JSON.parse(JSON.stringify(value)); },
    remove: () => { inMemoryHistoryState = null; }
  },
  now: () => 123456,
  uid: (prefix) => `${prefix}_test`,
  sanitizeText: (value) => String(value || "").trim(),
  truncate: (value, length) => String(value || "").slice(0, length),
  normalizeForSearch: (value) => String(value || "").toLowerCase(),
  emit: (name, payload) => historyEvents.push({ name, payload })
};
const historySandbox = { window: { TutorlyChatbot: historyCore } };
vm.createContext(historySandbox);
vm.runInContext(chatHistorySource, historySandbox);
const historyModule = historyModules.history;
const disposableConversation = historyModule.createConversation({ seed: "Temporary deletion test" });
assert.strictEqual(historyModule.getActiveConversationId(), disposableConversation.id);
assert.ok(historyModule.deleteConversation(disposableConversation.id), "deleteConversation should return the deleted chat");
assert.strictEqual(historyModule.getConversation(disposableConversation.id), null, "deleted chat should leave the conversation store");
assert.strictEqual(historyModule.getActiveConversationId(), null, "deleting the active chat should clear its active state");
assert.ok(historyEvents.some((event) => event.name === "history:conversation-deleted"), "deletion should emit a history event");

const getBotStart = app.indexOf("async function getBotReply");
const sendStart = app.indexOf("async function sendMessage", getBotStart);
assert.ok(getBotStart >= 0 && sendStart > getBotStart, "semantic reply function should exist");
const activeReplyPath = app.slice(getBotStart, sendStart);
assert.ok(activeReplyPath.includes("requestBackendChat"), "active reply path should always use backend AI service");
assert.ok(!activeReplyPath.includes("SubjectEngine"), "active reply path must not use local subject detection");
assert.ok(!activeReplyPath.includes("getLocalBotReply"), "active reply path must not use local keyword answers");
assert.ok(!activeReplyPath.includes("getConfidentAdvancedMathReply"), "active reply path must not bypass semantic routing");

assert.ok(policySource.includes("route.answer_format"), "response policy should accept LLM-selected answer format");
assert.ok(policySource.includes("route.response_length"), "response policy should accept LLM-selected response length");
assert.ok(!policySource.includes("subjectKeywords"), "response policy should not contain subject keyword lists");
assert.ok(visuals.includes("route?.visual"), "visual selection should come from the semantic route");
assert.ok(!visuals.includes("diagramKeywords"), "visual policy should not contain diagram keyword lists");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(policySource, sandbox);
const policy = sandbox.window.TutorlyResponsePolicy;
const semanticPlan = policy.analyze("indirectly worded student question", {
  semanticRoute: {
    subject: "biology",
    topic: "cellular respiration",
    intent: "why_question",
    response_type: "explanation",
    answer_format: "why_explanation",
    response_length: "short",
    visual: { needed: true, type: "cell_diagram", placement: "after_intro" },
    tools: { diagram_renderer: true }
  }
});
assert.strictEqual(semanticPlan.subject, "biology");
assert.strictEqual(semanticPlan.kind, "why_explanation");
assert.strictEqual(semanticPlan.responseLength, "short");
assert.strictEqual(semanticPlan.visual.type, "cell_diagram");
assert.ok(!semanticPlan.actions.some((action) => ["quiz_me", "similar_question", "harder_question"].includes(action.id)),
  "default response actions should not append or suggest practice questions");

const visualSandbox = { window: {} };
vm.createContext(visualSandbox);
vm.runInContext(visuals, visualSandbox);
const visualEngine = visualSandbox.window.TutorlyEducationalVisuals;
const quadraticGraph = visualEngine.fromSemanticRoute({
  subject: "mathematics",
  topic: "quadratic function",
  visual: {
    needed: true,
    type: "graph",
    title: "Graph of y = x²",
    elements: ["x-axis", "y-axis", "vertex"],
    placement: "before_summary"
  }
}, "Plot y = x²");
assert.ok(quadraticGraph.svg.includes("<polyline"), "quadratic graph should render an actual curve");
assert.ok(quadraticGraph.title.includes("x²"), "quadratic graph should preserve its equation label");

const frontendFiles = [];
function walk(folder) {
  fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|html)$/i.test(entry.name)) frontendFiles.push(target);
  });
}
walk(path.join(root, "js"));
fs.readdirSync(root).filter((name) => name.endsWith(".html")).forEach((name) => frontendFiles.push(path.join(root, name)));
const frontendText = frontendFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.ok(!frontendText.includes("GROQ_API_KEY"), "Groq key name must not appear in frontend assets");
assert.ok(!frontendText.toLowerCase().includes("api.groq.com"), "frontend must never call Groq directly");

console.log("Tutorly semantic frontend, adaptive formatting, Markdown, visual placement, and key-isolation checks passed.");
