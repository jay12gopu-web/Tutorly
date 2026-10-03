// Audit regressions: synthetic plans and browser adapters, never real accounts.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../js/study/plan-engine');
const S = require('../js/study/plan-store');
const markdown = require('../js/chatbot/markdown-renderer');
const rich = require('../js/chatbot/rich-response-renderer');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const today = '2026-10-03';
const plan = E.createPlan({id:'audit-exam',subject:'Science',examDate:'2026-10-10',minutesPerDay:60,topics:[{id:'student-motion',title:'Motion'}]},{today});
check('M13 undo completion is immutable, restores progress and remains scheduled', () => {
  const id = plan.tasks[0].id;
  const done = E.completeTask(plan,id,{today});
  const before = JSON.stringify(done);
  const reopened = E.reopenTask(done,id,{today});
  assert.equal(JSON.stringify(done),before);
  assert.equal(E.progress(reopened).completedTasks,0);
  const task = reopened.tasks.find(item=>item.id===id);
  assert.equal(task.status,'pending'); assert.equal(task.completedDate,undefined);
  assert.ok(reopened.days.some(day=>day.taskIds.includes(id)) || reopened.unscheduledTaskIds.includes(id));
});
check('M14 backup round-trip, account isolation, merge without overwrite', () => {
  const values = new Map(); let account='audit-a';
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const store=S.create({storage,getAccountKey:()=>account}); store.savePlan(plan);
  const backup=store.exportPlans(); const done=E.completeTask(plan,plan.tasks[0].id,{today});store.savePlan(done);
  store.importPlans(backup);assert.equal(store.read().plans[0].tasks[0].status,'completed');
  account='audit-b';assert.equal(store.read().plans.length,0);
  store.importPlans(backup);assert.equal(store.read().plans.length,1);
  assert.deepEqual(S.create({storage,getAccountKey:()=>account}).read().plans[0],plan);
});
check('M14 malicious, duplicate and malformed plan backups do not change storage', () => {
  const store=S.create({storage:{getItem:()=>null,setItem:()=>{}}});store.savePlan(plan);
  const before=store.exportPlans();
  const backup=plans=>JSON.stringify({type:'tutorly-study-backup',version:1,plans});
  for (const bad of [backup([plan,plan]),backup([{...plan,days:[{date:today,taskIds:['missing']}]}]),backup([{...plan,tasks:[...plan.tasks,plan.tasks[0]]}]),backup([{...plan,unscheduledTaskIds:null}]),'x'.repeat(2000001)]) {
    assert.throws(()=>store.importPlans(bad));assert.equal(store.exportPlans(),before);
  }
});
check('H11 both real referral implementations retain code and expiry across ticks', () => {
  const scripts=[...read('refer_earn.html').matchAll(/function randomCode\(\) \{[\s\S]*?(?=\s+function formatMs\()/g)].map(match=>match[0]);
  assert.equal(scripts.length,2);
  for(const script of scripts) {
    const values=new Map();const sandbox={Date:{now:()=>1000},Math,codeEl:{},localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
    vm.createContext(sandbox);
    vm.runInContext(`const codeKey=CODE_KEY=legacyCodeKey=LEGACY_CODE_KEY='tutorly_ref_code';const expKey=EXP_KEY=legacyExpKey=LEGACY_EXP_KEY='tutorly_ref_expires_at';const prefix=CODE_PREFIX='TUTORLY-';${script}`,sandbox);
    const first=sandbox.ensureCode();
    for(let i=0;i<50;i++) { const next=sandbox.ensureCode();assert.equal(next.code,first.code);assert.equal(next.exp,first.exp); }
    assert.equal(values.get('tutorly_ref_code'),first.code);
    sandbox.Date.now=()=>first.exp+1;assert.ok(sandbox.ensureCode().exp>first.exp);
  }
});
check('M02 bare display equations render as math without converting prose or links', () => {
  assert.match(markdown.render(String.raw`[ 3^{2}+4^{2}=9+16=25 ]`,{richResponse:rich}),/tutorly-katex/);
  assert.doesNotMatch(markdown.render('[Read these notes]',{richResponse:rich}),/tutorly-katex/);
  assert.match(markdown.render('[NCERT](https://ncert.nic.in)',{richResponse:rich}),/href="https:\/\/ncert.nic.in"/);
  assert.ok(fs.existsSync(path.join(__dirname,'../assets/vendor/katex/katex.min.js')));
});
check('H05 contextual actions reach the existing chat and material test pipeline', () => {
  assert.match(read('js/practice-curriculum.js'),/practiceChapter/);
  assert.match(read('js/app.js'),/practiceChapter/);
  assert.match(read('js/lessons/lesson-module.js'),/curriculumChapter/);
  assert.match(read('js/exams/exam-system.js'),/curriculumChapter/);
  assert.match(read('js/exams/material-input.js'),/curriculum_context/);
});
check('H13/M16/M18/L10 demo disclosures are visible before action and promise no queue', () => {
  assert.match(read('more-tools.html'),/demo/i);
  assert.match(read('ask-doubt.html'),/no tutor will receive it/);
  assert.match(read('find-tutor.html'),/not real tutors/);
  assert.match(read('js/find-tutor.js'),/Try demo request/);
  assert.doesNotMatch(read('js/find-tutor.js'),/queued once|Send request/);
  assert.match(read('leaderboard.html'),/sample|demo/i);
  assert.match(read('refer_earn.html'),/no coins are issued/);
});
check('M10/M20/M24/L06 canonical profile, free curriculum, focus guards and feature title', () => {
  assert.match(read('js/campus.js'),/profile-hub/);
  assert.doesNotMatch(read('more-tools.html'),/class="tool-learn-crown"/);
  assert.match(read('js/global-layout.js'),/inert/);
  assert.match(read('maths_gpt.html'),/<title>AI Tutor \| Tutorly<\/title>/);
  assert.doesNotMatch(read('frontend/subscription/payment-history.js'),/mtu_|localStorage\.setItem/,'viewing history must not create a new billing identity');
});
check('M23/M25/L07 reader and history controls have labels and scoped dark overrides', () => {
  for (const label of ['Search test history','Sort test history','Filter test history by type']) assert.ok(read('tests.html').includes(`aria-label="${label}"`));
  assert.match(read('css/audit-repairs.css'),/body\.lesson-dark\.mt-mobile-app header\.learn-topbar\.mt-mobile-header/);
  assert.match(read('css/audit-repairs.css'),/reader-utilities summary.*color: var\(--lesson-ink\) !important/);
  assert.match(read('lessons.html'),/<h1 id="readerTitle">/);
  assert.doesNotMatch(read('lessons.html'),/<h3>Contents<\/h3>/);
});
(async () => {
  const sandbox={window:{setTimeout},console};sandbox.window.window=sandbox.window;
  for (const file of ['schema','graph-engine','geometry-engine','mock-provider','provider']) vm.runInNewContext(read(`js/live-board/${file}.js`),sandbox);
  const board=sandbox.window.TutorlyLiveBoard;
  for (const prompt of ['Draw the structure of a cell','Show a particle diagram','Graph the relationship']) {
    const lesson=await board.generateLesson({prompt});assert.equal(lesson.visualMode,'none','unsupported visual must not be fake boxes/default curve');
  }
  assert.equal((await board.generateLesson({prompt:'Graph y = x² - 4'})).visualMode,'graph');
  checks++; console.log('PASS H09/M08 unsupported visuals are honest; supported graph retained');
  console.log(`Audit frontend: ${checks} checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
