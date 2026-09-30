'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../js/study/plan-engine');
const storeApi = require('../js/study/plan-store');
const quiz = require('../js/study/quiz-card');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this.style = {}; this.value = ''; this.classList = {add(){},toggle(){}}; }
  getContext() { return null; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key,value) { this.attributes[key] = value; }
  addEventListener(key,fn) { this.events[key] = fn; }
  focus() { this.focused = true; }
}
const nodes = node => [node,...node.children.flatMap(nodes)];
const container = new Element('section'), memory = new Map();
let account = 'student-a', selected, checks = 0;
const storage = {getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
const window = { TutorlyStudyPlanEngine:engine, TutorlyStudyPlanStore:{create:options=>storeApi.create({...options,storage})}, TutorlyStudyQuiz:quiz,
  TutorlyCurriculum:{currentProfile:()=>({board:'CBSE',grade:'9'})}, crypto:{randomUUID:()=>`fixture-${++checks}`}, addEventListener(){} };
const context = {window, document:{createElement:tag=>new Element(tag)}, FormData:global.FormData};
vm.runInNewContext(fs.readFileSync('js/study/materials.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('js/study/setup-controls.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('js/study/planner-ui.js','utf8'),context);
const planner = window.TutorlyStudyPlanner.create({container,getAccountKey:()=>account,onStudyTask:(plan,task)=>{selected={plan,task};}});
const find = text => nodes(container).find(node=>node.textContent===text);
function fill(label,value) { const field=nodes(container).find(node=>node.tag==='label'&&node.children[0]?.textContent===label); assert.ok(field,label); const input=field.children[1]; input.value=value; input.events.input?.(); return input; }
const advance = ()=>nodes(container).find(node=>node.tag==='form').events.submit({preventDefault(){}});
planner.open({draft:{}});
assert.ok(find('When is your exam?')); advance();
assert.ok(find('What are you preparing for?')); fill('Subject','Science'); advance();
assert.ok(find('What would make you feel ready?'));
const slider=nodes(container).find(node=>node.attributes.role==='slider');
for(let i=0;i<5;i++)slider.events.keydown({key:'ArrowRight',preventDefault(){}});
assert.equal(slider.attributes['aria-valuenow'],'85');
fill('Anything else? (optional)','Calculations'); advance();
assert.ok(find('Bring your study material')); fill('Or paste your notes','Motion: Speed is distance divided by time. A car travels 20 m in 4 s, so its speed is 5 m/s.'); advance();
assert.ok(find('What needs to go into your plan?')); fill('Add your own topics','Motion'); advance();
assert.ok(find('Science exam prep')); find('Start today’s study').events.click();
const active=planner.getActiveSessionContext();
assert.equal(active.targetScore,85); assert.equal(planner.getMaterials()[0].label,'Pasted notes');
assert.match(planner.getMaterials()[0].text,/20 m/);
console.log('PASS ordered setup, target/worries, pasted material, saved profile, plan and same-chat task');
const check={plan_id:active.planId,task_id:active.taskId,questions:[
  {topic:'Motion',question:'20 m in 4 s: speed?',options:['5 m/s','80 m/s'],answer:0,explanation:'Speed is 20 / 4 = 5 m/s.'},
  {topic:'Motion',question:'SI unit of speed?',options:['m/s','m'],answer:0,explanation:'Distance in metres divided by seconds gives m/s.'}
]};
assert.ok(quiz.normalize(check)); assert.equal(quiz.normalize({...check,questions:[{...check.questions[0],answer:5},check.questions[1]]}),null);
assert.equal(quiz.normalize({...check,questions:[{...check.questions[0],options:['Same','same']},check.questions[1]]}),null);
assert.equal(quiz.score(check,[0]),null);
planner.quizAttempt(check,'check1',[1]);
assert.throws(()=>planner.quizAttempt(check,'check1',[0]),/already saved/);
const result=quiz.score(check,[1,0]); assert.equal(result.correct,1);
planner.quizAttempt(check,'check1',[1,0],result);
const store=storeApi.create({storage,getAccountKey:()=>account});
assert.equal(store.read().plans[0].studyChecks[0].correct,1);
assert.equal(store.read().plans[0].studyChecks[0].source,'quiz');
planner.quizAttempt(check,'check1',[1,0],result);
assert.equal(store.read().plans[0].studyChecks.length,1);
assert.equal(planner.quizAttempt(check,'check1').scored,true);
assert.throws(()=>planner.quizAttempt({...check,task_id:'wrong'},'bad',[0]),/Open this task/);
console.log('PASS first-attempt grading, duplicate/reload protection, task binding and saved adaptation evidence');
const quizContext={window:{},document:context.document}; vm.runInNewContext(fs.readFileSync('js/study/quiz-card.js','utf8'),quizContext);
let answers=[], completed=0;
const cardHost=new Element('div');
quizContext.window.TutorlyStudyQuiz.mount(cardHost,check,{id:'ui',canAnswer:()=>true,load:()=>null,save:value=>{answers=value;},complete:()=>{completed++;return true;},continue(){},explain(){}});
const click=text=>{const button=nodes(cardHost).find(node=>node.tag==='button'&&node.textContent===text); assert.ok(button,text); button.events.click();};
click('Check answer'); assert.ok(nodes(cardHost).some(node=>node.textContent==='Choose an answer first.'));
nodes(cardHost).filter(node=>node.tag==='input')[1].events.change(); click('Check answer');
assert.ok(nodes(cardHost).some(node=>node.textContent?.startsWith('Not quite.'))); click('Next question');
nodes(cardHost).filter(node=>node.tag==='input')[0].events.change(); click('Check answer'); click('See recap');
assert.equal(completed,1); assert.deepEqual(Array.from(answers),[1,0]);
console.log('PASS actual quiz UI selection, validation, feedback, next question and recap');
account='student-b'; planner.open(); assert.equal(planner.getActiveSessionContext(),null); assert.equal(planner.quizAttempt(check,'check1'),null);
console.log('PASS notes and attempts isolated from another account');
const excerpts=window.TutorlyStudyMaterials.excerpts([{label:'Long notes',text:'x'.repeat(24000)},{label:'Other notes',text:'y'.repeat(24000)}]);
assert.equal(excerpts.reduce((n,item)=>n+item.text.length,0),12000); assert.equal(excerpts[0].partial,true);
console.log('PASS note excerpts bounded and truncation explicit');
const controls=require('../js/study/setup-controls');
assert.equal(controls.monthDays(2028,1).filter(Boolean).length,29);
assert.equal(controls.monthDays(2026,1).filter(Boolean).length,28);
assert.equal(controls.scoreAtPoint(0,-10),0); assert.equal(controls.scoreAtPoint(10,0),25); assert.equal(controls.scoreAtPoint(0,10),50); assert.equal(controls.scoreAtPoint(-10,0),75);
console.log('PASS leap-year calendar and circular score geometry');
