"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const teaching = require("../js/chatbot/teaching-actions.js");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "maths_gpt.html"), "utf8");
const voice = fs.readFileSync(path.join(root, "js/chatbot/voice-chat.js"), "utf8");
const adapter = fs.readFileSync(path.join(root, "js/chatbot/elevenlabs-voice.js"), "utf8");

assert.deepEqual(teaching.normalize(null), []);
assert.deepEqual(teaching.normalize({ id: "show_diagram" }), []);
assert.deepEqual(teaching.normalize([
  null, { id: { toString: "broken" } }, { id: "__proto__" }, { id: "constructor" }, { id: "charge_credits" },
  { id: "give_example", label: "<img src=x onerror=alert(1)>", strategy: "private" },
  { id: "give_example" }, { id: "talk_it_through", label: { private: true } }
]), [
  { id: "give_example", label: "Give an example" },
  { id: "talk_it_through", label: "Talk it through" }
]);
assert.equal(teaching.followup("constructor"), "");
assert.equal(teaching.followup("talk_it_through"), "");
assert.match(teaching.followup("show_diagram", { topic: "Magnetic field", prompt: "How do field lines work?" }), /Science View[\s\S]*Magnetic field[\s\S]*How do field lines work/);
assert(!teaching.voiceContext({ topic: "Fractions", internal_strategy: "private" }).includes("private"));
assert(html.indexOf("js/chatbot/teaching-actions.js") < html.indexOf("js/app.js"));

function sourceFunction(start, end) {
  const begin = app.indexOf(start);
  const finish = app.indexOf(end, begin + start.length);
  assert(begin >= 0 && finish > begin, `App function boundaries exist for ${start}`);
  return app.slice(begin, finish).trim();
}

const sent = [];
const opened = [];
const feedback = [];
const notices = [];
let legacyActionsCalls = 0;
const env = vm.createContext({
  TeachingActions: teaching,
  ResponsePolicy: { actionsFor: () => { legacyActionsCalls += 1; return [{ id: "more_detail", label: "More Detail", prompt: "Explain more." }]; } },
  escapeHtml: (text) => String(text).replace(/[&<>"']/g, ""),
  document: { createElement: () => ({ innerHTML: "", className: "", addEventListener(name, listener) { this[name] = listener; }, querySelectorAll: () => [] }) },
  sendMessage: async (options) => { sent.push(options); },
  sendTeachingFeedback: async (value) => { feedback.push(value); return { followup: "Canned answer must not render" }; },
  addMessage: () => { throw new Error("Feedback must request a response through the normal chat pipeline"); },
  openTeachingVoice: (button, focus) => { opened.push({ button, focus }); },
  chatRequestInFlight: false,
  activeConversationId: "chat-active",
  selectedModel: "prime",
  showToast: (value) => notices.push(value)
});
vm.runInContext(`this.attach = ${sourceFunction("function attachBotMessageActions(", "function streamBotReply(")}`, env);

function render(actions, extra = {}) {
  const content = { appendChild(node) { this.actions = node; } };
  const message = { dataset: {}, querySelector(selector) { return selector === ".bot-content" ? content : null; } };
  const context = { semanticRoute: { topic: "Magnetic field", subject: "physics" } };
  if (actions !== undefined) context.teachingActions = actions;
  env.attach(message, "Field lines indicate the direction of the magnetic field.", {
    conversationId: "chat-active", messageId: "assistant-1", prompt: "How do field lines work?", context, ...extra
  });
  return content.actions;
}

async function click(actions, id, action = "teaching") {
  const button = { dataset: { action, contextAction: id } };
  await actions.click({ target: { closest: () => button } });
  return button;
}

async function main() {
  const all = ["another_method", "give_example", "show_diagram", "talk_it_through"].map((id) => ({ id }));
  const row = render(all);
  assert.match(row.innerHTML, /Try another method/);
  assert.match(row.innerHTML, /View diagram/);
  assert.equal((row.innerHTML.match(/data-action="teaching"/g) || []).length, 4);
  assert.equal(legacyActionsCalls, 0);
  assert.equal(sent.length, 0, "Rendering suggestions must not generate a response or charge for images");
  assert.equal(opened.length, 0, "Rendering a voice suggestion must not activate a microphone");

  for (const id of ["another_method", "give_example", "show_diagram"]) {
    await click(row, id);
    assert.equal(sent.at(-1).teachingAction, id);
    assert.match(sent.at(-1).text, /Magnetic field[\s\S]*How do field lines work/);
    assert.equal(sent.at(-1).preserveComposer, true, "Action clicks retain a draft in the composer");
    assert.equal(sent.at(-1).skipPendingImage, true, "Action clicks must not submit an unsent attachment");
  }
  const trigger = await click(row, "talk_it_through");
  assert.equal(opened.length, 1);
  assert.equal(opened[0].button, trigger, "Existing voice entry receives the clicked button for focus return");
  assert.equal(opened[0].focus.topic, "Magnetic field");
  assert.match(opened[0].focus.reply, /Field lines/);
  assert.equal(sent.length, 3, "Voice does not submit a duplicate text-chat request");

  await click(row, "charge_credits");
  assert.equal(sent.length, 3);
  env.chatRequestInFlight = true;
  await click(row, "another_method");
  await click(row, "talk_it_through");
  env.chatRequestInFlight = false;
  env.activeConversationId = "different-chat";
  await click(row, "another_method");
  env.activeConversationId = "chat-active";
  assert.equal(sent.length, 3, "Busy or stale conversation actions must not send");
  assert.equal(opened.length, 1);

  assert(!render([]).innerHTML.includes("contextual-actions"), "An explicit empty offer suppresses the legacy fallback row");
  assert(!render([{ id: "debug_strategy", label: "private" }]).innerHTML.includes("private"));
  assert(render(undefined).innerHTML.includes("More Detail"), "Stored older messages retain their compatible actions");
  assert.equal(legacyActionsCalls, 1);

  for (const action of ["simpler", "examples", "confused"]) await click(row, "", action);
  assert.equal(feedback.length, 3);
  assert.equal(sent.length, 6, "Legacy teaching feedback uses the real response pipeline");
  await click(row, "", "understood");
  assert.equal(sent.length, 6);
  assert.equal(notices.at(-1), "Thanks for letting me know.");

  const transcript = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user", content: index === 7 ? "I am stuck on the field direction." : "Recent context. ".repeat(100)
  }));
  transcript.unshift({ role: "system", content: "Private internal instruction" });
  const voiceEnv = vm.createContext({
    activeConversationId: "chat-active", GPT: { getConversation: () => ({ messages: transcript }) }, ChatHistory: null,
    TeachingActions: teaching, voiceTeachingFocus: opened[0].focus,
    localStorage: { getItem: (key) => ({ tutorly_grade: "9", tutorly_board: "CBSE" }[key] || "") },
    readStoredAccountValue: () => "Sam Student", getVoiceLanguage: () => "en-IN",
    window: { TutorlyCurriculum: { getActiveContext: () => ({ subject: "Physics", chapter: "Magnetism" }) } }
  });
  vm.runInContext(`this.contextForVoice = ${sourceFunction("function getVoiceConversationContext(", "function recordProviderVoiceMessage(")}`, voiceEnv);
  const context = voiceEnv.contextForVoice();
  assert.match(context, /Talk it through[\s\S]*Current topic: Magnetic field/);
  assert.match(context, /Student grade: 9[\s\S]*Current chapter: Magnetism/);
  assert(context.includes("I am stuck on the field direction."), "Newest transcript survives provider context limits");
  assert(!context.includes("Private internal instruction"));
  assert(context.length < 12000, "Voice handoff must fit the existing provider context limit");
  assert(voice.includes('context: options.getConversationContext?.() || ""'));
  assert(adapter.includes("conversation.sendContextualUpdate(context.slice(0, 12_000))"));
  assert(app.includes("openTeachingVoice = openVoiceChat"));
  assert(app.includes('voiceSession.open("voice", trigger)'));
  assert(app.includes("autoStartImage: !options.teachingAction"), "Teaching followups require separate consent for generated illustrations");
  assert(app.includes("teachingActions: messageRecord.metadata?.teachingActions"), "Stored teaching suggestions survive reloading history");
  console.log("Adaptive teaching actions, contextual followups, optional voice handoff, and history checks passed.");
}

async function browserChecks() {
  const { chromium } = require(process.env.TUTORLY_PLAYWRIGHT_PATH || "playwright");
  const browser = await chromium.launch({ channel: process.env.TUTORLY_TEST_BROWSER || "msedge", headless: true });
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const requests = [];
      const pageErrors = [];
      let imageRequests = 0;
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.addInitScript(() => {
        window.TUTORLY_BACKEND_ORIGIN = "https://tutorly.test";
        localStorage.setItem("tutorly_preferred_voice_agent", "miles");
        localStorage.setItem("tutorly_voice_onboarding_completed", "true");
        window.voiceProbe = { starts: 0, microphoneRequests: 0, contexts: [], ends: 0 };
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
          voiceProbe.microphoneRequests += 1;
          return { getTracks: () => [{ stop() {} }] };
        } });
        window.ElevenLabsClient = { Conversation: { startSession: async (options) => {
          voiceProbe.starts += 1;
          options.onConnect({ conversationId: "mock-elevenlabs-session" });
          return {
            getId: () => "mock-elevenlabs-session", getInputVolume: () => 0, getOutputVolume: () => 0,
            sendContextualUpdate: (context) => voiceProbe.contexts.push(context),
            endSession: async () => { voiceProbe.ends += 1; }, setMicMuted() {}
          };
        } } };
      });
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://tutorly.test") return route.abort();
        if (url.pathname === "/api/chat") {
          const payload = route.request().postDataJSON();
          requests.push(payload);
          return route.fulfill({ json: {
            conversation_id: payload.conversation_id, answer: "Field lines show the direction of a magnetic field. Outside a magnet, they run from north to south.",
            metadata: {
              semantic_route: { subject: "physics", topic: "Magnetic field", intent: "concept_explanation", visual: { needed: false, type: "none" } },
              teaching_actions: ["another_method", "give_example", "show_diagram", "talk_it_through"].map((id) => ({ id }))
            }
          } });
        }
        if (url.pathname === "/api/images/generate") imageRequests += 1;
        if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { enabled: false } });
        const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "Not found" });
        const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
        return route.fulfill({ contentType: types[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
      });
      try {
        await page.goto("https://tutorly.test/maths_gpt.html");
        await page.locator("#input").fill("Explain magnetic field lines");
        await page.locator("#sendBtn").click();
        await page.getByRole("button", { name: "Try another method", exact: true }).waitFor();
        assert.equal(await page.evaluate(() => voiceProbe.starts), 0);
        assert.equal(await page.evaluate(() => voiceProbe.microphoneRequests), 0);
        const geometry = await page.locator(".contextual-actions button").evaluateAll((buttons) => buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width, height: box.height };
        }));
        assert.equal(geometry.length, 4);
        for (const box of geometry) assert(box.left >= 0 && box.right <= width && box.height >= 32, `Teaching buttons fit and remain tappable at ${width}px`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
        await page.locator("#input").fill("Keep my unsent question here");
        await page.getByRole("button", { name: "View diagram", exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('[data-context-action="talk_it_through"]').length === 2);
        assert.equal(requests.length, 2);
        assert.equal(requests[1].client_context.teaching_action, "show_diagram");
        assert.equal(requests[1].conversation_id, requests[0].conversation_id);
        assert(requests[1].history.some((message) => message.content === "Explain magnetic field lines"));
        assert.match(requests[1].message, /Science View[\s\S]*Magnetic field/);
        assert.equal(await page.locator("#input").inputValue(), "Keep my unsent question here");
        assert.equal(imageRequests, 0);
        await page.getByRole("button", { name: "Talk it through", exact: true }).last().click();
        await page.waitForFunction(() => voiceProbe.contexts.length === 1);
        const probe = await page.evaluate(() => voiceProbe);
        assert.equal(probe.starts, 1, "Consent starts one existing ElevenLabs session");
        assert.equal(probe.microphoneRequests, 1);
        assert.match(probe.contexts[0], /Talk it through[\s\S]*Current topic: Magnetic field[\s\S]*Recent conversation:/);
        assert(probe.contexts[0].includes("Explain magnetic field lines"));
        assert.equal(await page.locator("#voiceOnboardingModal").isVisible(), false, "Saved voices do not encounter duplicate onboarding");
        await page.locator("#voiceSessionClose").click();
        await page.waitForFunction(() => voiceProbe.ends === 1);
        assert.equal(requests.length, 2, "Voice handoff leaves the text conversation active without duplicate requests");
        assert.equal(await page.locator("#input").inputValue(), "Keep my unsent question here");
        assert.deepEqual(pageErrors, [], `No browser runtime errors at ${width}px`);
        console.log(`Adaptive teaching full app browser checks passed at ${width}px (mocked chat, microphone, and ElevenLabs SDK).`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().then(() => process.argv.includes("--browser") ? browserChecks() : null)
  .catch((error) => { console.error(error); process.exitCode = 1; });
