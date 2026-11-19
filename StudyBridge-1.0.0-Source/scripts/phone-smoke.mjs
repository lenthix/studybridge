import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const require=createRequire(import.meta.url),{createRelay}=require('../dist/relay.cjs');
const relay=createRelay({staticDir:path.resolve('dist/ui')});relay.server.listen(0,'127.0.0.1');await once(relay.server,'listening');const base='http://127.0.0.1:'+relay.server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const req=async(route,method='GET',body,secret)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(secret?{Authorization:'Bearer '+secret}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok);return r.json();};
try{
 const owner=await req('/api/sessions','POST');await page.goto(base+'/#code='+owner.code);await page.getByText('Connection details',{exact:true}).waitFor();let devices=[];for(let i=0;i<20&&!devices.length;i++){devices=await req(`/api/sessions/${owner.id}/devices`,'GET',undefined,owner.secret);if(!devices.length)await new Promise(r=>setTimeout(r,100));}assert.equal(devices.length,1);assert.equal(devices[0].approved,true);
 const snapshot={assets:{},sessionId:'fixture-session',revision:1,status:'Complete',items:[{id:'fixture-1',number:1,status:'answered',question:{kind:'numerical',text:'A cyclist travels 120 m in 8 s. What is the average speed?',choices:[],fields:[],passage:'Assume constant direction.',visualDescription:'',imageRefs:[],missingInformation:false},answer:{answer:'$v = \\frac{120}{8} = 15\\,\\mathrm{m/s}$',choiceIndices:[],selectedChoices:[],fields:[],explanation:'Divide the distance travelled by the elapsed time. The resulting units are metres per second.',confidence:.98,needsReview:false},material:{label:'Local UI test fixture — not live AI',text:'',images:[]}}],batches:[],requests:2,reserved:.09,estimated:.002,capture:false,source:'',preview:''};
 await req(`/api/sessions/${owner.id}/snapshot`,'POST',snapshot,owner.secret);await page.locator('.answer-box').waitFor();assert.equal(await page.locator('.question').count(),1);assert.equal(await page.locator('.katex').count(),1);await page.getByRole('button',{name:'Bookmark question'}).click();await page.getByRole('combobox',{name:'Filter answers'}).selectOption('bookmarks');assert.equal(await page.locator('.question').count(),1);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);await page.screenshot({path:'test-results/phone.png',fullPage:true});
 await page.reload();await page.locator('.answer-box').waitFor();assert.equal(await page.locator('.question').count(),1);
 await req(`/api/sessions/${owner.id}/devices/${devices[0].id}`,'DELETE',undefined,owner.secret);await page.getByText('Session expired or access revoked. Pair again.').waitFor();assert.equal(await page.locator('.question').count(),0);assert.deepEqual(errors,[]);
 const report={checks:['phone QR join without laptop approval','authenticated live snapshot','math rendering','bookmarks','390px layout without overflow','reload reconnect without duplicate answers','revocation clears viewer'],browser:'Microsoft Edge mobile viewport emulation',realPhone:false,liveAI:false,errors};await writeFile('test-results/phone-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await relay.shutdown();}


