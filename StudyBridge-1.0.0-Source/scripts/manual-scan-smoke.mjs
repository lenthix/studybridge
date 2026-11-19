import {_electron as electron,chromium,expect} from 'playwright/test';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const require=createRequire(import.meta.url),{createRelay}=require('../dist/relay.cjs');
const relay=createRelay({staticDir:path.resolve('dist/ui')});relay.server.listen(0,'127.0.0.1');await once(relay.server,'listening');const base='http://127.0.0.1:'+relay.server.address().port;
const app=await electron.launch({args:['.'],env:{...process.env,STUDYBRIDGE_TEST_PROFILE:path.resolve('test-results/manual-scan-'+Date.now())}});
const browser=await chromium.launch({channel:'msedge',headless:true});
const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Set up StudyBridge'}).waitFor();
 await app.evaluate(({BrowserWindow},base)=>{
  const originalFetch=globalThis.fetch;globalThis.__studyTestCalls=[];
  globalThis.fetch=async(input,init)=>{
   const url=String(input);if(url.startsWith('https://studybridge-test.invalid/'))return originalFetch(url.replace('https://studybridge-test.invalid',base),init);
   if(url!=='https://api.openai.com/v1/responses')throw Error('Unexpected network destination in test');
   const body=JSON.parse(init.body);globalThis.__studyTestCalls.push({name:body.text.format.name,hasImage:body.input[0].content.some(c=>c.type==='input_image'),schema:body.text.format.schema});
   const extracted={questions:[{kind:'short',text:'What is two plus two?',choices:[],fields:[],passage:'',visualDescription:'',imageRefs:['selected-source'],missingInformation:false}],warnings:[]};
   const answered={answer:'4',choiceIndices:[],selectedChoices:[],fields:[],confidence:.95,needsReview:false};
   return new Response(JSON.stringify({id:'resp_test',object:'response',created_at:1,status:'completed',model:body.model,output:[{type:'message',id:'msg_test',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(body.text.format.name==='study_questions'?extracted:answered),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const fixture=new BrowserWindow({width:700,height:400,title:'Study capture fixture',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});globalThis.__studyFixture=fixture;fixture.loadURL('data:text/html,<title>Study capture fixture</title><body style="background:white;color:black;font:32px sans-serif;padding:40px">Study review<br><br>What is two plus two?</body>');
 },base);
 const command=c=>page.evaluate(c=>window.study.command(c),c);const init=await page.evaluate(()=>window.study.init());
 assert.equal((await command({type:'settings',settings:{...init.config,onboarded:true,relayUrl:'https://studybridge-test.invalid',interval:5},key:'sk-LOCAL-MOCK-ONLY'})).ok,true);
 await page.getByRole('button',{name:'Study',exact:true}).click();
 const sources=await command({type:'sources'}),selected=sources.value.find(s=>s.name==='Study capture fixture');assert.ok(selected);
 await command({type:'select',id:selected.id});await command({type:'start',consent:true,sourceId:selected.id,materials:[]});
 await wait(5500);assert.equal((await page.evaluate(()=>window.study.init())).snapshot.requests,0);
 const connected=await command({type:'connect'});assert.equal(connected.ok,true);
 await phone.goto(base+'/#code='+connected.value.code);
 let devices=[];for(let i=0;i<50&&!devices.length;i++){devices=(await page.evaluate(()=>window.study.init())).relay.devices;await wait(100);}
 assert.equal(devices.length,1);assert.equal(devices[0].approved,true);
 const scan=phone.getByRole('button',{name:'Scan now',exact:true});await expect(scan).toBeEnabled({timeout:15000});await scan.click();
 await phone.locator('.answer-box').waitFor({timeout:20000});assert.equal(await phone.locator('.answer-box .prose').innerText(),'4');
 assert.equal(await phone.getByText('Why this answer',{exact:true}).count(),0);
 await wait(6000);let state=(await page.evaluate(()=>window.study.init())).snapshot;assert.equal(state.requests,2);assert.equal(state.capture,false);assert.equal(state.phoneReady,true);
 const first=state.lastScanId;await scan.click();
 for(let i=0;i<100;i++){state=(await page.evaluate(()=>window.study.init())).snapshot;if(state.lastScanId!==first)break;await wait(100);}
 assert.notEqual(state.lastScanId,first);await wait(1500);assert.equal((await page.evaluate(()=>window.study.init())).snapshot.requests,2);
 await command({type:'pause'});await expect(scan).toBeDisabled({timeout:10000});await command({type:'resume'});await expect(scan).toBeEnabled({timeout:10000});
 await app.evaluate(()=>globalThis.__studyFixture.close());await scan.click();
 for(let i=0;i<100;i++){state=(await page.evaluate(()=>window.study.init())).snapshot;if(state.status.includes('unavailable'))break;await wait(100);}
 assert.match(state.status,/unavailable/);assert.equal(state.phoneReady,false);
 await command({type:'stop'});await expect(scan).toBeDisabled({timeout:10000});
 const calls=await app.evaluate(()=>globalThis.__studyTestCalls);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.hasImage));assert.ok(!JSON.stringify(calls[1].schema).includes('explanation'));
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await phone.screenshot({path:'test-results/manual-phone.png',fullPage:true});
 const report={checks:['QR pairing connects without desktop confirmation','no automatic snapshot after enabling','phone tap travels through relay to Windows capture','plain answer delivered to phone','no timer-triggered AI requests','unchanged scan deduplicates','pause disables and resume enables button','closed source disables scans','Stop disables button','answer schema has no explanations','390px phone layout fits'],liveAI:false,realPhone:false};
 await writeFile('test-results/manual-scan-smoke.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();await app.close();await relay.shutdown();}
