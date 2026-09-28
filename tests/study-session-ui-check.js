'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../js/study/plan-engine');
const storageApi = require('../js/study/plan-store');
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log('PASS ' + label); };
const storage = new Map();
const adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
let account = 'test-a';
const store = storageApi.create({ storage: adapter, getAccountKey: () => account });
const plan = engine.createPlan({id:'test-plan',subject:'Science',examDate:'2026-09-28',minutesPerDay:45,topics:[{id:'motion',title:'Motion'}]}, {today:'2026-09-21'});
check('plan save, refresh and completion persistence', () => {
  store.savePlan(plan);
  const fresh = storageApi.create({storage:adapter,getAccountKey:()=>account});
  assert.equal(fresh.read().plans[0].id, plan.id);
  store.savePlan(engine.completeTask(plan, plan.tasks[0].id, {today:'2026-09-21'}));
  assert.equal(fresh.read().plans[0].tasks[0].status,'completed');
});
check('plans are isolated by account and guest namespace', () => {
  account='test-b'; assert.equal(store.read().plans.length,0);
  account=null; assert.equal(store.read().plans.length,0);
  account='test-a'; assert.equal(store.read().plans.length,1);
});
check('browsing a second plan does not switch active study context', () => {
  store.select(plan.id,plan.tasks[0].id);
  store.savePlan({...plan,id:'second-plan'});
  assert.equal(store.read().selectedPlanId,'second-plan');
  assert.equal(store.read().activePlanId,plan.id);
  store.clearActiveSession(); assert.equal(store.read().activePlanId,null);
  assert.equal(store.read().plans.length,2);
});
check('storage failure preserves in-tab work and gives an honest warning', () => {
  const blocked=storageApi.create({storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});
  blocked.savePlan(plan); assert.equal(blocked.read().plans.length,1);
  assert.match(blocked.getError(), /could not save/);
});
check('malformed saved records are rejected without dropping valid plans', () => {
  assert.equal(storageApi.validPlan({...plan,examDate:'2026-02-31'}),false);
  assert.equal(storageApi.validPlan({...plan,tasks:[null]}),false);
  assert.throws(()=>store.savePlan({...plan,days:null}),/safely/);
});
const window = {TutorlyStudyPlanEngine:engine};
const source = fs.readFileSync('js/study/session-controller.js','utf8');
vm.runInNewContext(source,{window});
check('exam prompt prefill uses explicit dates and does not invent syllabus', () => {
  const draft=window.TutorlyStudySession.detectExamDraft('My Science exam is in 1 week.');
  assert.equal(draft.subject,'Science');
  assert.equal(draft.examDate,engine.addDays(engine.todayDate(),7));
  assert.equal(draft.topics,undefined);
  assert.equal(window.TutorlyStudySession.detectExamDraft('Explain atoms'),null);
  assert.equal(window.TutorlyStudySession.detectExamDraft('My Maths exam is tomorrow').examDate,engine.addDays(engine.todayDate(),1));
});
check('study actions reuse one chat and require explicit task/quiz saving', () => {
  assert.match(source,/options\.send\(PROMPTS\[action\]/);
  assert.match(source,/Finish & save task/);
  assert.match(source,/source: 'student_report'/);
  assert.match(source,/Do not use Live Board/);
  assert.match(source,/correct\.value === ''/);
  assert.doesNotMatch(source,/fetch\(|innerHTML|createElement\('iframe'\)|createElement\('textarea'\)/);
});
check('same main chat includes bounded context and blocks Study-only board entrypoints', () => {
  const app=fs.readFileSync('js/app.js','utf8');
  assert.match(app,/study_session: studySession\?\.context\(context.studyAction\)/);
  assert.match(app,/function updateLiveBoardFromResponse[^]*?if \(selectedModel === "study" \|\| studySession\?\.isActive\(\)\) return;/);
  assert.match(app,/function openLiveBoardFromMessage[^]*?Live Board is off in Study Bot/);
  assert.match(app,/studySession\?\.restore\(conversation.id\)/);
  const html=fs.readFileSync('maths_gpt.html','utf8');
  assert.equal((html.match(/id="input"/g)||[]).length,1);
  assert.equal((html.match(/id="studyPlannerView"/g)||[]).length,1);
  const css=fs.readFileSync('css/study-session.css','utf8');
  assert.match(css,/\.work-area\[hidden\] \{ display: none !important/);
});
check('curriculum choices exclude review data and material labels do not pretend to upload', () => {
  const ui=fs.readFileSync('js/study/planner-ui.js','utf8');
  assert.match(ui,/chapter.verification_status === 'verified'/);
  assert.match(ui,/Student-provided titles stay separate/);
  assert.match(ui,/files are not uploaded or read here/);
  assert.match(ui,/These are my results on this device/);
  assert.match(ui,/Save and rebalance/);
});
console.log(`Study UI/storage: ${checks} checks passed.`);
