'use strict';
// Exercise the actual controller without a provider, auth bypass, or browser data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/study/session-controller.js', 'utf8');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.hidden = true; this.classList = { add() {}, toggle() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  focus() { this.focused = true; }
}
const nodes = element => [element, ...element.children.flatMap(nodes)];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(resolveAccount) {
  const view = new Element('section'), bar = new Element('section'), timers = new Map();
  let opened = 0, shown = 0, session;
  const planner = { open() { opened++; view.hidden = false; view.replaceChildren(new Element('plan-list')); }, close() { view.hidden = true; }, getActiveSessionContext() { return null; } };
  const window = {
    TutorlyStudyPlanner: { create: () => planner }, addEventListener() {},
    setTimeout(fn) { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }
  };
  const document = { getElementById: id => id === 'studyPlannerView' ? view : bar, createElement: tag => new Element(tag), body: new Element('body') };
  vm.runInNewContext(source, { window, document });
  session = window.TutorlyStudySession.create({ ready: resolveAccount, getConversationId: () => null, isBusy: () => false, showPlanner() { shown++; }, showChat() { session.close(); }, notify() {} });
  return { session, view, timers, opened: () => opened, shown: () => shown, find: text => nodes(view).find(node => node.textContent === text) };
}
async function main() {
  const guest = setup(() => Promise.resolve());
  await guest.session.open();
  assert.equal(guest.opened(), 1); assert.equal(guest.view.hidden, false);
  console.log('PASS guest sidebar opens the real planner');

  const pending = deferred(); let current = pending.promise, calls = 0;
  const account = setup(() => { calls++; return current; });
  const first = account.session.open();
  assert.equal(account.shown(), 1); assert.equal(account.view.hidden, false);
  assert.ok(account.find('Loading your study plans…'));
  pending.reject(new Error('offline')); await first;
  assert.equal(account.opened(), 0, 'failed identity must never reveal guest/account plans');
  assert.ok(account.find('Retry'));
  current = Promise.resolve();
  await account.find('Retry').events.click();
  assert.equal(account.opened(), 1); assert.ok(calls >= 3);
  assert.equal(account.view.attributes['aria-busy'], 'false');
  console.log('PASS signed-in failure shows a retry and retries account resolution successfully');

  const hang = setup(() => new Promise(() => {}));
  const hungOpen = hang.session.open();
  await Promise.resolve();
  [...hang.timers.values()].forEach(fn => fn()); await hungOpen;
  assert.ok(hang.find('Retry')); assert.equal(hang.opened(), 0);
  console.log('PASS stalled profile lookup has a bounded wait and recoverable state');

  const late = deferred(), cancelled = setup(() => late.promise);
  const opening = cancelled.session.open();
  cancelled.find('Back to chat').events.click();
  late.resolve(); await opening;
  assert.equal(cancelled.opened(), 0); assert.equal(cancelled.view.hidden, true);
  console.log('PASS returning to chat prevents late lookup from reopening planner');

  const expired = setup(() => Promise.reject(Object.assign(new Error('expired'), { status: 401 })));
  await expired.session.open();
  assert.equal(expired.opened(), 0);
  assert.equal(expired.find('Sign in again').href, 'login.html?intent=chatbot');
  console.log('PASS expired session gives sign-in recovery without exposing saved plans');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
