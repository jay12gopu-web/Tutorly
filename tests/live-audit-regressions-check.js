// Execute the actual page controllers against isolated DOM/API fixtures.
// No production credentials, provider calls or persistent user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
class Node {
  constructor() { this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; this.dataset = {}; this.style = {setProperty() {}}; this.events = {}; this.attrs = {}; this.children = []; this.classList = {add() {}, remove() {}, toggle() {}, contains: () => false}; }
  addEventListener(type, fn) { this.events[type] = fn; }
  setAttribute(key, value) { this.attrs[key] = value; }
  querySelectorAll() { return []; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(...nodes) { this.children.push(...nodes); }
  focus() {}
}
function harness(html) {
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Node()]));
  const storage = new Map([['tutorly_name','Untrusted cached name'], ['tutorly_subscription',JSON.stringify({currentPlan:'pro',creditAllowance:999,premiumCreditsRemaining:999})], ['tutorly_chatbot_history_v1','{"conversations":[]}']]);
  const document = {readyState:'loading', visibilityState:'visible', events:{},
    getElementById: id => nodes[id] || null, createElement: () => new Node(),
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener(type, fn) { this.events[type] = fn; },
    body: new Node(), documentElement: new Node()};
  const window = {document, events:{}, location:{hash:'', search:'', href:'profile.html'},
    addEventListener(type, fn) { this.events[type] = fn; }};
  const context = {window, document, localStorage:{getItem:key => storage.get(key) ?? null, setItem:(key,value) => storage.set(key,String(value)), removeItem:key => storage.delete(key)},
    location:window.location, history:{replaceState() {}}, CSS:{escape:value => value},
    matchMedia:() => ({matches:false}), MutationObserver:class {observe() {}},
    URLSearchParams, console, setTimeout:() => 1, clearTimeout() {}};
  return {nodes, storage, window, document, context:vm.createContext(context)};
}
const user = {id:'test-student',email:'student@example.invalid',full_name:'Verified Student',role:'student',grade:'9',board:'CBSE'};
async function profileTest() {
  const h = harness(read('profile.html'));
  h.nodes.profileAccountContent.hidden = true;
  let reply = {authenticated:true,user}; let failure = null; let pending;
  const Auth = h.window.TutorlyAuth = {
    getSessionToken:() => h.storage.get('tutorly_session_token') || '',
    currentUser:async () => { if (pending) return pending; if (failure) throw failure; return reply; },
    clearSession:() => h.storage.delete('tutorly_session_token'),
    getVoicePreferences:async () => ({}),
  };
  h.window.TutorlyPlanConfig = require('../shared/tutorly-plans.js');
  h.window.TutorlyVoiceConfig = {ready:async () => [],normalizeVoice:() => '',getVoice:() => ({})};
  h.window.TutorlyEducation = {load:async () => {throw Error('No registry fixture');}};
  vm.runInContext(read('js/profile-hub.js'),h.context);
  await h.document.events.DOMContentLoaded();
  assert.equal(h.nodes.profileAccountContent.hidden,true,'Signed-out account details must stay hidden');
  assert.equal(h.nodes.profileSessionTitle.textContent,"You're signed out");
  assert.equal(h.nodes.profileSignIn.hidden,false);
  assert.match(h.nodes.profileSignIn.href,/login.html/);
  assert.equal(h.storage.has('tutorly_longest_streak'),false,'Guests must not calculate/persist device activity');

  h.storage.set('tutorly_session_token','synthetic');
  failure = {status:401};
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileSessionTitle.textContent,'Your session has expired');
  assert.equal(h.nodes.profileAccountContent.hidden,true);
  assert.equal(Auth.getSessionToken(),'');
  assert.equal(h.storage.get('tutorly_chatbot_history_v1'),'{"conversations":[]}', 'Expiry must preserve learning data');

  h.storage.set('tutorly_session_token','synthetic');
  failure = {status:503};
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileSessionRetry.hidden,false);
  assert.equal(h.nodes.profileAccountContent.hidden,true,'Network failure must not reveal cached account');
  failure = null;
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileAccountContent.hidden,false,'Retry should recover verified profile');
  assert.equal(h.nodes.profileTitle.textContent,user.full_name);
  assert.equal(h.nodes.summaryGrade.textContent,'Grade 9');
  assert.equal(h.nodes.profilePlan.textContent,'Plan unavailable','Device credit/plan cache is not authenticated data');
  assert.equal(h.nodes.creditsStat.textContent,'—');

  reply = {authenticated:true,user,subscription:{currentPlan:'standard',creditAllowance:100,premiumCreditsRemaining:0}};
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.creditsStat.textContent,'0','A verified zero balance is not a missing/default 100 balance');
  reply.subscription.premiumCreditsRemaining = null;
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.creditsStat.textContent,'—','Null credit data cannot become zero or the default allowance');

  reply = {authenticated:true};
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileAccountContent.hidden,true,'Malformed account response must not fabricate Student');
  assert.equal(h.nodes.profileSessionRetry.hidden,false);
  reply = {authenticated:true,user,onboarding_required:true};
  await h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileSignIn.href,'info.html');
  assert.equal(h.nodes.profileAccountContent.hidden,true);

  let resolve;
  pending = new Promise(r => {resolve = r;});
  const request = h.nodes.profileSessionRetry.events.click();
  assert.equal(h.nodes.profileAccountContent.hidden,true,'No account flash while resolving');
  h.storage.delete('tutorly_session_token');
  await h.window.events.storage({key:'tutorly_session_token'});
  resolve({authenticated:true,user}); await request;
  assert.equal(h.nodes.profileAccountContent.hidden,true,'Late response cannot reveal an account after logout');
  assert.equal(h.nodes.profileSessionTitle.textContent,"You're signed out");
  console.log('Profile: 10 guest/expired/offline/retry/account/credit/onboarding/race scenarios passed.');
}
async function boardTest() {
  const h = harness(read('live-board.html'));
  let timer; let requested;
  h.window.setTimeout = fn => {fn(); return 1;};
  h.window.setInterval = fn => {timer = fn; return 1;};
  h.window.clearInterval = () => {timer = null;};
  h.storage.set('tutorly_live_board_context_v1',JSON.stringify({conversationId:'other-chat',prompt:'Stale topic',semanticRoute:{subject:'science'}}));
  const LB = h.window.TutorlyLiveBoard = {};
  for (const file of ['schema','graph-engine','geometry-engine','diagram-primitives','mock-provider','provider']) vm.runInContext(read(`js/live-board/${file}.js`),h.context);
  class Board {
    constructor() { this.stepIndex = 0; Board.latest = this; }
    compactState() {return {};}
    setLesson(lesson) { this.lesson = lesson; this.stepIndex = 0; }
    replay() {this.stepIndex = 0;}
    next() {this.stepIndex = Math.min(this.stepIndex+1,this.lesson.steps.length-1);}
    previous() {this.stepIndex = Math.max(0,this.stepIndex-1);}
  }
  LB.BoardEngine = Board;
  const generate = LB.generateLesson;
  LB.generateLesson = request => {requested = request; return generate(request);};
  vm.runInContext(read('js/live-board/app.js'),h.context);
  assert.equal(h.nodes.liveBoardStatus.textContent,'Ready for a topic');
  assert.equal(h.nodes.liveBoardPlay.disabled,true);
  assert.equal(Board.latest.lesson,undefined,'Standalone entry must not load stale chat topic');
  h.nodes.liveBoardTopic.value = 'Graph y = x^2';
  await h.nodes.liveBoardTopicForm.events.submit({preventDefault() {}});
  assert.equal(h.nodes.liveBoardStatus.textContent,'Ready');
  assert.equal(Board.latest.lesson.visualMode,'graph');
  assert.equal(requested.conversationId,'');
  assert.equal(requested.semanticRoute,null);
  assert.equal(requested.followUp,false);
  h.nodes.liveBoardPlay.events.click(); timer();
  assert.equal(Board.latest.stepIndex,1);
  assert.match(h.nodes.liveBoardStepLabel.textContent,/Step 2/);
  timer(); timer();
  assert.equal(h.nodes.liveBoardPlay.textContent,'Play');
  h.nodes.liveBoardPlay.events.click();
  assert.equal(Board.latest.stepIndex,0,'Play at end restarts playback');
  h.nodes.liveBoardReplay.events.click();
  assert.equal(timer,null);
  h.nodes.liveBoardTopic.value = 'What is five plus seven?';
  await h.nodes.liveBoardTopicForm.events.submit({preventDefault() {}});
  assert.equal(Board.latest.lesson.visualMode,'none');
  assert.equal(h.nodes.liveBoardPlay.disabled,true);

  const linked = harness(read('live-board.html'));
  linked.window.location.search = '?conversationId=saved-chat';
  linked.storage.set('tutorly_live_board_context_v1',JSON.stringify({conversationId:'saved-chat',prompt:'Graph y = x^2'}));
  linked.window.TutorlyLiveBoard = LB; linked.window.clearInterval = () => {};
  vm.runInContext(read('js/live-board/app.js'),linked.context); await flush();
  assert.match(linked.nodes.liveBoardBackToChat.href,/conversationId=saved-chat/);
  assert.equal(linked.nodes.liveBoardTopic.value,'Graph y = x^2');
  console.log('Live Board: empty entry, actual graph provider, playback/replay, unsupported topic and chat handoff passed.');
}
(async () => {await profileTest(); await boardTest();})().catch(error => {console.error(error);process.exitCode = 1;});
