"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/chatbot/chat-suggestions.js"), "utf8");

function load(storage) {
  const window = {};
  Object.defineProperty(window, "sessionStorage", { get: () => storage() });
  const sandbox = { window, fetch() { throw new Error("Suggestions must not make network calls"); } };
  vm.runInNewContext(source, sandbox);
  return { api: window.TutorlyChatSuggestions, sandbox };
}

function documentFixture() {
  const doc = {
    createElement(tagName) {
      return {
        tagName, ownerDocument: doc, children: [], attributes: {}, listeners: {}, textContent: "",
        setAttribute(key, value) { this.attributes[key] = value; },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...children) { this.children = children; },
        addEventListener(name, callback) { this.listeners[name] = callback; }
      };
    },
    createElementNS(_namespace, tagName) { return this.createElement(tagName); }
  };
  return doc.createElement("div");
}

const saved = new Map();
const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
const { api, sandbox } = load(() => storage);
const ids = items => Array.from(items, item => item.id).sort().join("|");
assert.equal(api.available().length, 6);
assert.equal(api.registry.filter(item => item.status === "unavailable").length, 8);
assert(Object.isFrozen(api.registry));
assert(api.registry.every(Object.isFrozen));
assert.equal(api.select().length, 3);
const first = api.select({ random: () => 0 });
const next = api.select({ random: () => 0, previous: first.map(item => item.id) });
assert.notEqual(ids(first), ids(next), "Identical RNG results must still rotate the prior combination");
assert.equal(new Set(next.map(item => item.id)).size, 3);
for (const count of [-1, 1, 3, 6, 100, NaN, Infinity]) {
  const items = api.select({ count, random: () => NaN });
  assert(items.length >= 1 && items.length <= 6);
  assert(items.every(item => item.status === "available" && item.action === "prefill"));
}
const container = documentFixture();
let selection;
const options = { onSelect: (prompt, item) => { selection = { prompt, id: item.id }; } };
const rendered = api.render(container, options);
assert.equal(container.children.length, 3);
assert.equal(ids(api.render(container, options)), ids(rendered), "Re-rendering is stable until a new-chat rotation");
const seen = new Set();
for (let index = 0; index < 100; index += 1) {
  for (const button of container.children) {
    assert.equal(button.type, "button", "Suggestions must never submit their containing form");
    assert.equal(button.children[0].attributes["aria-hidden"], "true");
    assert(button.children[1].textContent.length > 5);
    button.listeners.click();
    const item = api.available().find(entry => entry.id === selection.id);
    assert.equal(selection.prompt, item.prompt, "Prefill preserves the editable trailing space");
    seen.add(selection.id);
  }
  const prior = ids(api.render(container, options));
  const selected = api.rotate(container, options);
  assert.notEqual(ids(selected), prior);
  assert.equal(container.children.length, 3, "Repeated rendering must replace old buttons/listeners");
}
assert.equal(seen.size, 6, "All native suggestion types are reachable");
const last = ids(api.render(container));
const reloaded = load(() => storage).api;
assert.notEqual(ids(reloaded.render(documentFixture())), last, "Session storage carries only the prior combination across reloads");
assert.deepEqual([...saved.keys()], ["tutorly_chat_suggestions_v1"]);
assert(Array.isArray(JSON.parse(saved.get("tutorly_chat_suggestions_v1"))));
for (const read of [() => { throw new Error("blocked"); }, () => ({ getItem: () => "not JSON", setItem() { throw new Error("blocked"); } }), () => ({ getItem: () => '["<img onerror=alert(1)>","google-drive"]', setItem() {} })]) {
  const isolated = load(read).api;
  assert.equal(isolated.render(documentFixture()).length, 3);
  assert.equal(isolated.rotate(documentFixture()).length, 3);
}
assert.equal(api.render(null).length, 0);
vm.runInNewContext(source, sandbox);
assert.equal(sandbox.window.TutorlyChatSuggestions, api, "Loading twice must not create duplicate state");
assert(!/innerHTML|\bfetch\s*\(|\beval\s*\(|localStorage|API_KEY/.test(source), "Suggestions contain no network, secret, HTML-injection, or account storage path");
console.log("PASS: six native prefills; eight excluded integrations; rotation, persistence, restricted storage, accessible buttons, single initialization, no network/secrets/unsafe HTML.");
