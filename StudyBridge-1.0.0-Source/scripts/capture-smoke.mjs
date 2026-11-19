import {_electron as electron} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const app=await electron.launch({args:['.'],env:{...process.env,STUDYBRIDGE_TEST_PROFILE:path.resolve('test-results/capture-profile-'+Date.now())}});
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Set up StudyBridge'}).waitFor();
 await app.evaluate(({BrowserWindow})=>{
  globalThis.__studyTestCalls=[];
  globalThis.fetch=async(input,init)=>{
   const url=String(input);if(url!=='https://api.openai.com/v1/responses')throw Error('Unexpected network destination in test');
   const body=JSON.parse(init.body);globalThis.__studyTestCalls.push({name:body.text.format.name,hasImage:body.input[0].content.some(c=>c.type==='input_image')});
   const extracted={questions:[{kind:'short',text:'What is two plus two?',choices:[],fields:[],passage:'',visualDescription:'',imageRefs:['selected-source'],missingInformation:false}],warnings:[]};
   const answered={answer:'4',choiceIndices:[],selectedChoices:[],fields:[],explanation:'Two plus two equals four.',confidence:.95,needsReview:false};
   return new Response(JSON.stringify({id:'resp_test',object:'response',created_at:1,status:'completed',model:body.model,output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(body.text.format.name==='study_questions'?extracted:answered),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const fixture=new BrowserWindow({width:700,height:400,title:'Study capture fixture',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});globalThis.__studyFixture=fixture;fixture.loadURL('data:text/html,<title>Study capture fixture</title><body style="background:white;color:black;font:32px sans-serif;padding:40px">Study review<br><br>What is two plus two?</body>');
 });
 const init=await page.evaluate(()=>window.study.init());const saved=await page.evaluate(config=>window.study.command({type:'settings',settings:{...config,onboarded:true,interval:5},key:'sk-LOCAL-MOCK-ONLY'}),init.config);assert.equal(saved.ok,true);
 await page.getByRole('button',{name:'Study',exact:true}).click();
 const sources=await page.evaluate(()=>window.study.command({type:'sources'}));const selected=sources.value.find(s=>s.name==='Study capture fixture');assert.ok(selected);
 assert.equal((await page.evaluate(id=>window.study.command({type:'select',id}),selected.id)).ok,true);
 assert.equal((await page.evaluate(id=>window.study.command({type:'start',consent:true,continuous:true,sourceId:id,materials:[]}),selected.id)).ok,true);
 await page.getByText('Why this answer',{exact:true}).waitFor();const first=await page.evaluate(()=>window.study.init());assert.equal(first.snapshot.items.length,1);assert.equal(first.snapshot.items[0].answer.answer,'4');assert.equal(first.snapshot.capture,true);
 await new Promise(r=>setTimeout(r,5500));const duplicate=await page.evaluate(()=>window.study.init());assert.equal(duplicate.snapshot.items.length,1);assert.equal(duplicate.snapshot.requests,2);
 await app.evaluate(()=>globalThis.__studyFixture.close());await page.getByText('Selected source is unavailable. Select it again to resume.',{exact:true}).first().waitFor({timeout:12000});const final=await page.evaluate(()=>window.study.init());assert.equal(final.snapshot.capture,false);
 const calls=await app.evaluate(()=>globalThis.__studyTestCalls);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.hasImage));await page.evaluate(()=>window.study.command({type:'deleteKey'}));
 const report={checks:['explicit selected window capture reaches main-process OpenAI adapter','multimodal request and structured extraction/answer parsing','desktop answer display','unchanged screenshot avoids repeated requests','closing selected source automatically pauses capture'],provider:'mocked fetch; no live OpenAI request or billing',calls,realPhone:false};await writeFile('test-results/capture-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await app.close();}
