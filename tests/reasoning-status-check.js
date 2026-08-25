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

let timerCalls = 0;
const fakeWindow = {
  setTimeout() { timerCalls += 1; throw new Error("reasoning states must not use a rotation timer"); },
  clearTimeout() {}
};
const fakeDocument = { createElement: (tagName) => new FakeElement(tagName) };
vm.runInNewContext(source, { window: fakeWindow, document: fakeDocument });

const status = fakeWindow.TutorlyReasoningStatus;

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
assert.equal(math.content.querySelector(".reasoning-status-announcement").textContent, "Analyzing…");
assert.ok(!math.content.querySelector(".reasoning-status-announcement").textContent.includes("Tutorly is"));
assert.equal(timerCalls, 0, "status words must represent real stages instead of rotating on a timer");

status.setStage(math.message, "structuring");
assert.equal(math.content.querySelector(".reasoning-status-word").textContent, "Structuring");
assert.equal(math.content.querySelector(".reasoning-status-announcement").textContent, "Analyzing…", "screen readers should not announce every stage update");

status.setStage(math.message, "verifying");
assert.equal(math.content.querySelector(".reasoning-status-word").textContent, "Verifying");
assert.equal(timerCalls, 0);

const writing = createMessage();
status.start(writing.message, { subject: "english", intent: "writing_help" });
assert.equal(writing.content.querySelector(".reasoning-status-word").textContent, "Interpreting");

const image = createMessage();
status.start(image.message, { hasImage: true });
assert.equal(image.content.querySelector(".reasoning-status-word").textContent, "Interpreting");

const deep = createMessage();
status.start(deep.message, { model: "deep" });
assert.equal(deep.content.querySelector(".reasoning-status-word").textContent, "Evaluating");

const regenerated = createMessage();
status.start(regenerated.message, { preserveMessage: true });
assert.equal(regenerated.content.querySelector(".reasoning-status-word").textContent, "Refining");
assert.equal(regenerated.message.dataset.reasoningPreserve, "true");

status.stopAll();
for (const fixture of [math, writing, image, deep, regenerated]) {
  assert.ok(!fixture.message.classList.contains("reasoning-active"));
  assert.equal(fixture.content.querySelector(".reasoning-status-shell"), null);
}
assert.equal(regenerated.message.dataset.reasoningPreserve, undefined);
assert.equal(timerCalls, 0);

console.log("Tutorly stage-driven reasoning status, accessibility, and cleanup checks passed.");
