"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Execute the production lifecycle functions, not a duplicate state machine.
const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
function productionFunction(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert(start >= 0, `Missing production function: ${name}`);
  const tail = source.slice(start + 1);
  const next = /\n  (?:async )?function \w+\(/.exec(tail);
  return source.slice(start, next ? start + 1 + next.index : source.length);
}

function element() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } }, attributes: {}, children: [], value: "", textContent: "", hidden: false,
    scrollHeight: 52, disabled: false, focusCount: 0,
    classList: {
      contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
      toggle(key, enabled) { if (enabled) classes.add(key); else classes.delete(key); }
    },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener() {},
    focus() { this.focusCount += 1; },
    setSelectionRange(start, end) { this.selection = [start, end]; },
    querySelector() { return null; },
    scrollTop: 0,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 720, height: 100 })
  };
}

function harness(options = {}) {
  const body = element();
  const hero = element();
  const chatSuggestions = element();
  const chatTitle = element();
  const input = element();
  const sendBtn = element();
  const stopChatBtn = element();
  const voiceBtn = element();
  const speechTextBtn = element();
  const messages = element();
  const panel = element();
  const calls = { animations: [], fades: [], urls: [], active: [], rendered: [], toasts: [], rotations: 0, boardsClosed: 0, aborted: 0, curriculumCleared: 0 };
  for (const target of [hero, chatSuggestions]) {
    target.animate = (frames, timing) => {
      const animation = { frames, timing, cancelled: false, cancel() { this.cancelled = true; } };
      calls.fades.push(animation);
      return animation;
    };
  }
  const conversations = new Map((options.conversations || []).map(item => [item.id, item]));
  panel.getBoundingClientRect = () => ({ left: 100, top: body.classList.contains("has-chat") ? 600 : 300, width: 720, height: 120 });
  panel.animate = (frames, timing) => {
    const animation = { frames, timing, cancelled: false, cancel() { this.cancelled = true; } };
    calls.animations.push(animation);
    return animation;
  };
  const history = {
    getConversation: id => conversations.get(id),
    setActiveConversation(id) { calls.active.push(id); return true; }
  };
  const sandbox = {
    URL, body, chatTitle, chatSuggestions, input, sendBtn, stopChatBtn, voiceBtn, speechTextBtn, messages, workArea: element(),
    GPT: options.useGPT ? history : null, ChatHistory: history,
    pageParams: new URLSearchParams(options.requestedId ? { conversationId: options.requestedId } : {}),
    isGuestMode: !!options.guest, isWelcomeTrial: false, welcomeTrialLocked: false, WELCOME_TRIAL_LIMIT: 5,
    getWelcomeTrialCount: () => 0,
    document: { querySelector: selector => selector === ".composer-panel" ? panel : null, getElementById: id => id === "hero" ? hero : null, createElement: () => element() },
    window: {
      matchMedia: () => ({ matches: !!options.reducedMotion }),
      location: { href: "http://localhost/maths_gpt.html?other=keep#chat" },
      history: { state: { saved: true }, replaceState(_state, _title, url) { calls.urls.push(url); } },
      TutorlyLiveBoardPanel: { reset() { calls.boardsClosed += 1; } },
      TutorlyCurriculum: { clearActiveContext() { calls.curriculumCleared += 1; } },
      TutorlyChatSuggestions: { rotate(container, config) { assert.equal(container, chatSuggestions); assert.equal(typeof config.onSelect, "function"); calls.rotations += 1; } }
    },
    showToast: text => calls.toasts.push(text),
    abortActiveChatRequest: () => { calls.aborted += 1; },
    studySession: { restore() {}, reset() {} },
    setSelectedModel(_model, options) { assert.equal(options.persist, false, 'Reset must not overwrite the saved model preference'); },
    getStoredModel: () => 'prime',
    showChatWorkspace() {}, closeAccountMenu() {}, closeMobileSidebar() {}, closeHistoryPanel() {}, scrollToBottom() {},
    addMessage(text, type, metadata) { calls.rendered.push({ text, type, metadata, state: body.dataset.chatState }); },
    removePendingImage() { sandbox.pendingImage = null; },
    renderMarkdownNote: text => text, RichResponse: null, hydrateMathLearningCards() {},
    createBotAvatar: () => element(), attachEducationalVisual() {}, attachMathVisual() {}, attachGeographyVisual() {}, attachGeneratedImage() {}, attachBotMessageActions() {},
    openImageModal() {}, ReasoningStatus: null,
    pendingImage: null, chatRequestInFlight: false
  };
  vm.createContext(sandbox);
  const names = ["resizeInput", "updateSendState", "clearEmptyStateTransitions", "setChatMode", "prefillChatSuggestion", "updateConversationUrl", "restoreConversation", "loadConversation", "resetChat"];
  vm.runInContext(`let composerTransition = null; let emptyStateTransitions = []; let activeConversationId = ${JSON.stringify(options.activeId || null)};\n${names.map(productionFunction).join("\n")}`, sandbox);
  return { ...sandbox, sandbox, calls, panel, hero, getActive: () => vm.runInContext("activeConversationId", sandbox), getTransition: () => vm.runInContext("composerTransition", sandbox) };
}

const chat = { id: "chat-1", title: "A graph question", messages: [
  { id: "user-1", role: "user", content: "Graph y = x² - 4", attachments: [{ type: "image", previewUrl: "data:image/png;base64,AA==" }] },
  { id: "bot-1", parentId: "user-1", role: "assistant", content: "The vertex is (0, -4).", model: "prime", metadata: { semanticRoute: { visualMode: "graph" }, teachingActions: [{ type: "example" }] }, tools: { graph: true } }
] };

// A fresh chat is empty and the original composer is available immediately.
const fresh = harness();
fresh.restoreConversation();
assert.equal(fresh.body.dataset.chatState, "NEW_CHAT");
assert.equal(fresh.hero.inert, false);
assert.equal(fresh.chatSuggestions.attributes["aria-hidden"], "false");
assert.equal(fresh.calls.rendered.length, 0);
assert.equal(fresh.calls.animations.length, 0);

// Sending the first message changes mode once, and FLIP animates the same panel.
fresh.setChatMode(true);
assert.equal(fresh.body.dataset.chatState, "CONVERSATION");
assert.equal(fresh.hero.inert, true);
assert.equal(fresh.chatSuggestions.inert, true);
assert.equal(fresh.calls.animations.length, 1);
assert.match(fresh.calls.animations[0].frames[0].transform, /-300px/);
assert.equal(fresh.calls.animations[0].timing.duration, 280);
assert.equal(fresh.calls.fades.length, 2, "Heading and suggestions exit along with the composer movement");
assert.equal(fresh.hero.classList.contains("chat-empty-exit"), true);
fresh.setChatMode(true);
assert.equal(fresh.calls.animations.length, 1, "Subsequent messages must not replay the first-message transition");
fresh.setChatMode(false);
assert.equal(fresh.calls.animations[0].cancelled, true, "Resetting during transition cancels the old animation");
assert.equal(fresh.getTransition(), null);
assert.equal(fresh.hero.inert, false);
assert(fresh.calls.fades.every(item => item.cancelled), "Reset must cancel transient exit fades");
assert.equal(fresh.hero.classList.contains("chat-empty-exit"), false);
assert.equal(fresh.hero.style["--exit-top"], undefined);

const reduced = harness({ reducedMotion: true });
reduced.setChatMode(true);
assert.equal(reduced.calls.animations.length, 0, "Reduced-motion users receive the same state without motion");
assert.equal(reduced.calls.fades.length, 0);

// Saved history is put into conversation mode BEFORE any message is rendered.
for (const useGPT of [false, true]) {
  const saved = harness({ activeId: chat.id, conversations: [chat], useGPT });
  saved.restoreConversation();
  assert.equal(saved.body.dataset.chatState, "CONVERSATION");
  assert(saved.calls.rendered.every(item => item.state === "CONVERSATION"));
  assert.equal(saved.calls.animations.length, 0, "History restoration must skip empty-state animation");
  assert.equal(saved.input.focusCount, 0, "Refresh must not unexpectedly summon the mobile keyboard");
  assert.equal(saved.calls.rendered[0].metadata.imageSrc, "data:image/png;base64,AA==");
  assert.equal(saved.calls.rendered[1].metadata.prompt, "Graph y = x² - 4");
  assert.equal(saved.calls.rendered[1].metadata.semanticRoute.visualMode, "graph");
  assert.equal(saved.calls.rendered[1].metadata.toolkit.graph, true);
  assert.equal(saved.chatTitle.textContent, chat.title);
  assert.equal(saved.getActive(), chat.id);
  assert.match(saved.calls.urls.at(-1), /other=keep&conversationId=chat-1#chat$/);

  saved.input.value = "Unsent text";
  saved.resetChat();
  assert.equal(saved.body.dataset.chatState, "NEW_CHAT");
  assert.equal(saved.messages.innerHTML, "");
  assert.equal(saved.input.value, "");
  assert.equal(saved.getActive(), null);
  assert.equal(saved.calls.rotations, 1);
  assert.equal(saved.calls.boardsClosed, 2);
  assert.equal(saved.calls.curriculumCleared, 1);
  assert.equal(saved.calls.urls.at(-1), "/maths_gpt.html?other=keep#chat");
}

const requested = harness({ requestedId: chat.id, conversations: [chat] });
requested.restoreConversation();
assert.equal(requested.getActive(), chat.id, "An explicit history URL restores its conversation");
const missing = harness({ requestedId: "missing", activeId: chat.id, conversations: [chat] });
missing.restoreConversation();
assert.equal(missing.body.dataset.chatState, "NEW_CHAT");
assert.equal(missing.getActive(), null);
assert.equal(missing.calls.toasts.length, 1);
const guest = harness({ guest: true, requestedId: chat.id, activeId: chat.id, conversations: [chat] });
guest.restoreConversation();
assert.equal(guest.body.dataset.chatState, "NEW_CHAT");
assert.equal(guest.calls.rendered.length, 0, "Guest flow must not restore authenticated chat history");
assert.equal(guest.calls.active.length, 0, "Guest startup must not alter authenticated history");
const archived = { ...chat, archived: true };
const ignoredArchive = harness({ activeId: chat.id, conversations: [archived] });
ignoredArchive.restoreConversation();
assert.equal(ignoredArchive.body.dataset.chatState, "NEW_CHAT");
const explicitArchive = harness({ requestedId: chat.id, conversations: [archived] });
explicitArchive.restoreConversation();
assert.equal(explicitArchive.body.dataset.chatState, "CONVERSATION");
const emptySaved = harness({ activeId: "empty", conversations: [{ id: "empty", messages: [] }] });
emptySaved.restoreConversation();
assert.equal(emptySaved.body.dataset.chatState, "NEW_CHAT");

// Prefills are editable, preserve the trailing space, and use existing send/voice state.
const prefill = harness();
prefill.restoreConversation();
prefill.prefillChatSuggestion("Graph ");
assert.equal(prefill.input.value, "Graph ");
assert.deepEqual(prefill.input.selection, [6, 6]);
assert.equal(prefill.body.dataset.chatState, "NEW_CHAT", "Choosing a suggestion must not send it");
assert.equal(prefill.sendBtn.hidden, false);
assert.equal(prefill.voiceBtn.hidden, true);
assert.equal(prefill.speechTextBtn.hidden, false);
prefill.input.value = "";
prefill.updateSendState();
assert.equal(prefill.sendBtn.hidden, true);
assert.equal(prefill.voiceBtn.hidden, false);
prefill.sandbox.pendingImage = { previewUrl: "image" };
prefill.updateSendState();
assert.equal(prefill.sendBtn.hidden, false, "An attachment alone enables Send");
prefill.input.disabled = true;
prefill.prefillChatSuggestion("Do not overwrite");
assert.equal(prefill.input.value, "", "A locked composer must reject suggestion changes");

// Real addMessage covers voice transcripts and all non-typed conversation entry points.
const voice = harness();
voice.restoreConversation();
vm.runInContext(productionFunction("addMessage"), voice.sandbox);
voice.sandbox.addMessage("Explain that step again", "user");
assert.equal(voice.body.dataset.chatState, "CONVERSATION");
assert.equal(voice.messages.children.length, 1);
assert.equal(voice.messages.children[0].textContent, "Explain that step again");
voice.sandbox.addMessage("Here is a worked example.", "bot");
assert.equal(voice.calls.animations.length, 1);

console.log("PASS: production chat lifecycle, same-composer first-send animation, reduced motion, saved/history/guest/archive restoration, new-chat reset and rotation, editable prefills, attachment/voice Send state, and voice transcript rendering.");
