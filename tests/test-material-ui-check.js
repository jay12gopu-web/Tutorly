'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(){this.value='';this.children=[];this.events={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(name,fn){this.events[name]=fn;}
}
const ids=Object.fromEntries(['testMaterialFiles','testMaterialList','testPastedNotes','testMaterialStatus'].map(id=>[id,new Element()]));
const requests=[];
let failure=false;
const context={AbortController,document:{getElementById:id=>ids[id],createElement:()=>new Element()},window:{
  TutorlyAuth:{backendOrigin:()=> 'https://fixture.invalid',getSessionToken:()=> 'fixture'},
  TutorlyStudyMaterials:{readFile:async file=>({text:'Synthetic note text for '+file.name,partial:false})},crypto:{randomUUID:()=> 'fixture'},setTimeout,clearTimeout},
  fetch:async(url,options)=>{requests.push({url,...options});return {ok:!failure,status:failure?503:200,headers:{get:()=>null},json:async()=>failure?{detail:'Private provider detail'}:{questions:[{question:'Fixture'}]}}}};
vm.runInNewContext(fs.readFileSync('js/exams/material-input.js','utf8'),context);
const api=context.window.TutorlyTestMaterials,view=api.create({});
(async()=>{
  assert.throws(()=>view.get(),/Add a file/);
  ids.testPastedNotes.value='Short';assert.throws(()=>view.get(),/20 characters/);
  ids.testPastedNotes.value='x'.repeat(24001);assert.throws(()=>view.get(),/24,000/);
  ids.testPastedNotes.value='Speed is distance divided by time.';
  assert.equal(view.get()[0].text,ids.testPastedNotes.value);
  ids.testMaterialFiles.files=[{name:'notes.txt'}];await ids.testMaterialFiles.events.change();
  assert.equal(view.get().length,2);assert.equal(ids.testMaterialList.children.length,1);
  ids.testMaterialList.children[0].children[2].events.click();assert.equal(view.get().length,1);
  await api.generate(view.get(),{questionCount:5,difficulty:'Easy',includeSubjective:false},{grade:'9',board:'CBSE'});
  const body=JSON.parse(requests[0].body);assert.equal(body.materials[0].text,ids.testPastedNotes.value);assert.equal(body.grade,'9');
  assert.equal(requests[0].headers.Authorization,'Bearer fixture');
  failure=true;await assert.rejects(()=>api.generate(view.get(),{},{ }),/notes and settings are kept; please retry/);assert.equal(view.get().length,1);
  const html=fs.readFileSync('tests.html','utf8'),system=fs.readFileSync('js/exams/exam-system.js','utf8');
  assert.ok(html.includes('id="materialStep"'));assert.ok(!html.includes('id="subjectStep"'));assert.ok(!html.includes('id="chapterStep"'));
  assert.ok(!system.includes('generateQuestions('));assert.ok(system.includes('state.materialBased ? [] : state.selectedChapters.slice()'));
  assert.ok(system.includes('state.currentReport.questions.map'));assert.ok(system.includes('selfReviewed:true'));
  console.log('PASS material validation, upload/remove, authenticated generation, retry retention, upload-first setup, saved-paper retake and no fabricated chapter mastery');
})().catch(error=>{console.error(error);process.exitCode=1;});
