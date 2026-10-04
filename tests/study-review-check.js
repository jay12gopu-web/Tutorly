'use strict';
// Actual planner/controller regression tests. History/AI are isolated test
// adapters, not credentials, production accounts or manufactured live sessions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../js/study/plan-engine');
const storeApi = require('../js/study/plan-store');
const TODAY = '2026-10-04';
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.dataset = {}; this.hidden = false; this.classList = {add() {}, toggle() {}}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.events[key] = fn; }
  focus() { this.focused = true; }
}
const nodes = node => [node, ...node.children.flatMap(nodes)];
const source = file => fs.readFileSync(file, 'utf8');
async function setup() {
  const view = new Element('section'), bar = new Element('section'), data = new Map();
  const storage = {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)};
  let account = 'review-test-account', planner, session, activeId = 'unrelated-history-fixture', created = 0, busy = false;
  const chats = new Map([[activeId, {id: activeId, messages: [{content: 'Unrelated chat fixture'}]}]]);
  const attempts = [], opened = [], prepared = [], sent = [], notices = [];
  const store = storeApi.create({storage, getAccountKey: () => account});
  const window = {TutorlyStudyPlanEngine: {...engine, todayDate: () => TODAY},
    TutorlyStudyPlanStore: {create: () => store},
    addEventListener() {}, setTimeout, clearTimeout};
  const document = {getElementById: id => id === 'studyPlannerView' ? view : bar,
    createElement: tag => new Element(tag), body: new Element('body')};
  const context = vm.createContext({window, document});
  vm.runInContext(source('js/study/planner-ui.js'), context);
  const create = window.TutorlyStudyPlanner.create;
  window.TutorlyStudyPlanner = {create: options => (planner = create(options))};
  vm.runInContext(source('js/study/session-controller.js'), context);
  function openConversation(id) {
    attempts.push(id);
    const chat = chats.get(id);
    if (!chat?.messages.length) return false;
    activeId = id; opened.push(id); session.restore(id); return true;
  }
  session = window.TutorlyStudySession.create({ready: () => Promise.resolve(),
    getAccountKey: () => account, getConversationId: () => activeId, isBusy: () => busy,
    showPlanner() { view.hidden = false; }, showChat() { session.close(); },
    selectStudyMode() {}, focusComposer() {}, notify: message => notices.push(message), openConversation,
    prepareConversation(id) {
      prepared.push(id);
      if (!chats.has(id)) { id = `history-created-test-fixture-${++created}`; chats.set(id, {id, messages: []}); }
      activeId = id; session.restore(id); return id;
    },
    send(text, action) { sent.push({text, action, context: session.context(action)}); chats.get(activeId).messages.push({content: text}); }
  });
  await new Promise(resolve => setImmediate(resolve));
  const plan = engine.createPlan({id:'review-regression', subject:'Science', examDate:'2026-10-11',
    minutesPerDay:45, topics:[{id:'motion', title:'Motion'}, {id:'atoms', title:'Atoms'}]}, {today: TODAY});
  store.savePlan(plan); await session.open({planId: plan.id});
  const row = id => nodes(view).find(node => node.tag === 'article' && node.dataset.taskId === id);
  const click = (id, text) => {
    assert.ok(row(id), `Missing task row: ${nodes(view).map(node => node.textContent || '').filter(Boolean).join(' | ')}`);
    const button = nodes(row(id)).find(node => node.tag === 'button' && node.textContent === text);
    assert.ok(button, `Task ${id}: ${text}`); return button.events.click();
  };
  return {plan, store, session, planner: () => planner, view, bar, chats, attempts, opened, prepared, sent, notices, click, row,
    active: () => activeId, setActive: id => {activeId = id;}, setAccount: id => {account = id;}, setBusy: value => {busy = value;},
    reopen: () => session.open({planId: plan.id})};
}
const completed = h => h.store.read().plans[0];
const stateOf = plan => JSON.stringify({tasks:plan.tasks, days:plan.days, performance:plan.performance, progress:engine.progress(plan, {today:TODAY})});
async function main() {
  const h = await setup(), task = h.plan.tasks[0], other = h.plan.tasks[1];
  // Required regression: create task -> mark complete without studying -> Review.
  h.click(task.id, 'Mark done');
  const before = JSON.stringify(completed(h));
  h.click(task.id, 'Review in Tutorly');
  assert.ok(nodes(h.row(task.id)).some(node => /No study session yet/.test(node.textContent || '')));
  assert.equal(h.active(), 'unrelated-history-fixture');
  assert.equal(h.attempts.length, 0); assert.equal(h.prepared.length, 0); assert.equal(h.sent.length, 0);
  assert.equal(JSON.stringify(completed(h)), before, 'Review must not change completion, progress or the schedule');
  assert.ok(nodes(h.row(task.id)).every(node => node.tag !== 'a'), 'No fallback link may open the current chat');
  console.log('PASS created -> manually completed -> Review: no session state; unrelated chat stays untouched');

  h.click(task.id, 'Start this task in Tutorly');
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].context.task_id, task.id);
  assert.equal(completed(h).tasks.find(item => item.id === task.id).status, 'completed');
  assert.equal(completed(h).taskConversationIds[task.id], h.active(), 'Only the history adapter supplies the real binding');
  const taskChat = h.active();
  h.setActive('unrelated-history-fixture'); await h.reopen();
  const normalBefore = stateOf(completed(h));
  h.click(task.id, 'Review in Tutorly');
  assert.equal(h.active(), taskChat); assert.equal(h.session.context().task_id, task.id);
  assert.equal(h.sent.length, 1, 'Normal Review does not generate another answer');
  assert.equal(h.prepared.length, 1, 'Normal Review does not create a chat');
  assert.equal(stateOf(completed(h)), normalBefore);
  console.log('PASS explicit Start keeps completion; normal Review opens that exact saved task chat');

  await h.reopen(); h.setBusy(true);
  const busyBefore = stateOf(completed(h)), busyAttempts = h.attempts.length;
  h.click(task.id, 'Review in Tutorly');
  assert.equal(h.attempts.length, busyAttempts); assert.equal(stateOf(completed(h)), busyBefore);
  assert.match(h.notices[h.notices.length - 1], /Wait for the current answer/);
  h.setBusy(false);
  assert.equal(h.planner().bindConversation('x'.repeat(251)), false);
  assert.equal(h.planner().bindConversation(' altered-id '), false);
  assert.equal(completed(h).taskConversationIds[task.id], taskChat);
  console.log('PASS busy Review preserves context; invalid IDs are rejected, never trimmed or fabricated');

  // A different task's plan-wide chat is not evidence that this task was studied.
  await h.reopen(); h.click(other.id, 'Mark done');
  const noSessionBefore = stateOf(completed(h)), calls = h.attempts.length;
  h.click(other.id, 'Review in Tutorly');
  assert.equal(h.attempts.length, calls); assert.equal(stateOf(completed(h)), noSessionBefore);
  assert.ok(nodes(h.row(other.id)).some(node => /No study session yet/.test(node.textContent || '')));
  console.log('PASS unstudied task cannot borrow another task’s plan-wide chat');

  const secondChat = 'second-task-history-fixture'; h.chats.set(secondChat, {id: secondChat, messages:[{content:'Second task fixture'}]});
  h.planner().selectTask(h.plan.id, other.id); h.planner().bindConversation(secondChat);
  await h.reopen(); h.click(task.id, 'Review in Tutorly');
  assert.equal(h.active(), taskChat); assert.equal(h.session.context().task_id, task.id);
  assert.equal(h.session.context().topic, task.title);
  console.log('PASS Review selects the requested task even when another task/chat was studied most recently');

  // Several tasks may legitimately share the same exam conversation.
  h.planner().selectTask(h.plan.id, other.id); h.planner().bindConversation(taskChat);
  await h.reopen(); h.click(task.id, 'Review in Tutorly');
  assert.equal(h.active(), taskChat); assert.equal(h.session.context().task_id, task.id);
  assert.match(nodes(h.bar).find(node => node.tag === 'p').textContent, /completion status is unchanged/);
  console.log('PASS shared exam chat restores the exact reviewed task, not lastActiveTaskId');

  h.chats.delete(taskChat); h.setActive('unrelated-history-fixture'); await h.reopen();
  const missingBefore = stateOf(completed(h)), createCalls = h.prepared.length;
  h.click(task.id, 'Review in Tutorly');
  assert.equal(h.active(), 'unrelated-history-fixture'); assert.equal(h.prepared.length, createCalls);
  assert.ok(nodes(h.row(task.id)).some(node => /session is no longer available/.test(node.textContent || '')));
  assert.equal(stateOf(completed(h)), missingBefore);
  console.log('PASS deleted/unavailable saved chat never falls back or generates an ID');

  const legacy = await setup(), legacyTask = legacy.plan.tasks[0], legacyOther = legacy.plan.tasks[1];
  legacy.click(legacyTask.id, 'Mark done'); legacy.click(legacyOther.id, 'Mark done');
  legacy.chats.set('legacy-saved-chat', {id:'legacy-saved-chat', messages:[{content:'Legacy saved study fixture'}]});
  legacy.store.savePlan({...completed(legacy), conversationId:'legacy-saved-chat', lastActiveTaskId:legacyTask.id});
  await legacy.reopen(); legacy.click(legacyOther.id, 'Review in Tutorly'); assert.equal(legacy.attempts.length,0);
  legacy.click(legacyTask.id, 'Review in Tutorly'); assert.equal(legacy.active(),'legacy-saved-chat');
  assert.equal(legacy.session.context().task_id,legacyTask.id);
  assert.equal(completed(legacy).taskConversationIds[legacyTask.id],'legacy-saved-chat');
  console.log('PASS legacy last-studied-task link preserved without assigning it to unstudied tasks');

  legacy.setAccount('another-test-account'); legacy.click(legacyTask.id, 'Review in Tutorly');
  assert.equal(legacy.store.read().plans.length,0);
  assert.equal(legacy.attempts.length,1, 'Stale Review must not access a previous account’s task');
  const reviewSource = source('js/study/session-controller.js').split('onReviewTask(')[1].split('function context')[0];
  assert.doesNotMatch(reviewSource, /prepareConversation|options\.send|randomUUID/);
  assert.match(source('js/app.js'), /openConversation: \(id\) => \{[^]*?if \(!conversation \|\| !Array.isArray\(conversation.messages\) \|\| !conversation.messages.length\) return false;/);
  console.log('PASS account isolation and Review-only adapter has no create/send/fallback path');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
