const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "chatbot", "reasoning-status.js"), "utf8");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = "span") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.isConnected = true;
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
    });
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    this.isConnected = false;
  }

  matchesClass(selector) {
    if (!selector.startsWith(".")) return false;
    const expected = selector.slice(1);
    return this.className.split(/\s+/).includes(expected) || this.classList.contains(expected);
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matchesClass(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

let nextTimerId = 1;
const timers = new Map();
let prefersReducedMotion = false;
const fakeWindow = {
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) { timers.delete(id); },
  matchMedia() { return { matches: prefersReducedMotion }; }
};
const fakeDocument = { createElement: (tagName) => new FakeElement(tagName) };
const sandbox = { window: fakeWindow, document: fakeDocument };
vm.runInNewContext(source, sandbox);

const status = fakeWindow.TutorlyReasoningStatus;
const runNextTimer = () => {
  const next = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0];
  assert.ok(next, "a status transition timer should exist");
  timers.delete(next[0]);
  next[1].callback();
};

function createMessage() {
  const message = new FakeElement("div");
  const content = new FakeElement("div");
  content.className = "bot-content";
  message.append(content);
  return { message, content };
}

const math = createMessage();
status.start(math.message, { subject: "mathematics" });
assert.equal(math.content.querySelector(".reasoning-status-word").textContent, "Analyzing");
assert.equal(math.content.querySelector(".reasoning-status-visual").getAttribute("aria-hidden"), "true");
assert.equal(math.content.querySelector(".reasoning-status-announcement").textContent, "Tutorly is preparing a response.");
assert.equal(timers.size, 1, "one rotation timer should be active per status");

runNextTimer();
assert.ok(math.content.querySelector(".reasoning-status-visual").classList.contains("is-changing"));
runNextTimer();
assert.equal(math.content.querySelector(".reasoning-status-word").textContent, "Formulating");
assert.equal(timers.size, 1, "the next word should schedule one replacement timer only");

const writing = createMessage();
status.start(writing.message, { subject: "english", intent: "writing_help" });
assert.equal(writing.content.querySelector(".reasoning-status-word").textContent, "Interpreting");
assert.equal(timers.size, 2, "separate messages may each own one timer");

status.stopAll();
assert.equal(timers.size, 0, "stopAll must clear rotation and fade timers");
assert.ok(!math.message.classList.contains("reasoning-active"));
assert.ok(!writing.message.classList.contains("reasoning-active"));
assert.equal(math.content.querySelector(".reasoning-status-shell"), null);
assert.equal(writing.content.querySelector(".reasoning-status-shell"), null);

const preserved = createMessage();
status.start(preserved.message, { model: "deep", preserveMessage: true });
assert.equal(preserved.message.dataset.reasoningPreserve, "true");
status.stop(preserved.message);
assert.equal(preserved.message.dataset.reasoningPreserve, undefined);
assert.equal(timers.size, 0);

prefersReducedMotion = true;
const reduced = createMessage();
status.start(reduced.message, { intent: "concept_explanation" });
runNextTimer();
assert.equal(reduced.content.querySelector(".reasoning-status-word").textContent, "Clarifying");
assert.ok(!reduced.content.querySelector(".reasoning-status-visual").classList.contains("is-changing"));
assert.equal(timers.size, 1, "reduced motion should skip the fade timer and schedule only the next word");
status.stopAll();
assert.equal(timers.size, 0);

console.log("Tutorly reasoning-status sequence, accessibility, rotation, and cleanup checks passed.");
