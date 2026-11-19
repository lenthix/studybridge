import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();await mkdir('test-results',{recursive:true});
const packaged=process.env.STUDYBRIDGE_EXE;
const app=await electron.launch({...(packaged?{executablePath:packaged,args:[]}:{args:['.']}),env:{...process.env,STUDYBRIDGE_TEST_PROFILE:path.join(root,'test-results',(packaged?'packaged-profile-':'smoke-profile-')+Date.now())}});
const checks=[],errors=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByText('Your material.').waitFor();checks.push('first-run wizard renders');
 await page.getByRole('button',{name:'Set up StudyBridge'}).click();await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
 const init=await page.evaluate(()=>window.study.init());
 const fake='sk-STUDYBRIDGE-LOCAL-ENCRYPTION-TEST-NOT-A-REAL-KEY';
 const save=await page.evaluate(async({config,fake})=>window.study.command({type:'settings',settings:{...config,protect:true,onboarded:true},key:fake}),{config:init.config,fake});assert.equal(save.ok,true,save.error);
 const state=await page.evaluate(()=>window.study.init());assert.equal(state.hasKey,true);assert.ok(!JSON.stringify(state).includes(fake));
 const userData=await app.evaluate(({app})=>app.getPath('userData'));
 const encrypted=await readFile(path.join(userData,'key.enc'));
 const encryption=await app.evaluate(async({safeStorage,BrowserWindow},{fake,encoded})=>{const bytes=Buffer.from(encoded,'base64');const plain=await safeStorage.decryptStringAsync(bytes);return {encrypted:!bytes.includes(Buffer.from(fake)),roundtrip:plain.result===fake,protection:BrowserWindow.getAllWindows().every(w=>w.isContentProtected()),version:process.getSystemVersion(),electron:process.versions.electron};},{fake,encoded:encrypted.toString('base64')});
 assert.ok(encryption.encrypted&&encryption.roundtrip&&encryption.protection);checks.push('Windows encryption round trip; no plaintext key in settings response','capture protection enabled on every BrowserWindow');
 await page.evaluate(()=>window.study.command({type:'deleteKey'}));
 await page.evaluate(config=>window.study.command({type:'settings',settings:{...config,protect:false,onboarded:true}}),init.config);
 await page.getByRole('button',{name:'Study',exact:true}).click();await page.getByRole('button',{name:'Choose a screen or window'}).waitFor();
 const resume=await page.evaluate(()=>window.study.command({type:'resume'}));assert.equal(resume.ok,false);checks.push('Resume cannot bypass initial sharing consent');
 const sources=await page.evaluate(()=>window.study.command({type:'sources'}));assert.equal(sources.ok,true);assert.ok(sources.value.length>0);checks.push('Windows source picker lists available sources');
 await page.getByRole('textbox',{name:'Study text'}).fill('What is 2 + 2?');await page.getByRole('checkbox',{name:/Send this selected material/}).check();await page.getByRole('button',{name:'▶ Start',exact:true}).click();await page.getByRole('alert').filter({hasText:'Enter an API key'}).waitFor();checks.push('Start without API key gives a clear error');await page.getByRole('button',{name:'Dismiss',exact:true}).click();
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);checks.push('no renderer exceptions');
 await writeFile('test-results/'+(packaged?'packaged-smoke':'desktop-smoke')+'.json',JSON.stringify({checks,encryption,errors,liveAI:false,realPhone:false,cleanMachine:false},null,2));
 console.log(JSON.stringify({checks,encryption,errors},null,2));
}finally{await app.close();}

