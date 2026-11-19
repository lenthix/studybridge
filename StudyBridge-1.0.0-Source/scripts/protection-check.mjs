import {_electron as electron} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const app=await electron.launch({args:['.'],env:{...process.env,STUDYBRIDGE_TEST_PROFILE:path.resolve('test-results/protection-profile-'+Date.now())}});
try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'Set up StudyBridge'}).waitFor();
 const results=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{const w=BrowserWindow.getAllWindows()[0];w.focus();const id=w.getMediaSourceId();const samples=[];for(const protect of [false,true,false]){w.setContentProtection(protect);await new Promise(r=>setTimeout(r,350));const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:640,height:480}});const source=sources.find(s=>s.id===id);const b=source?.thumbnail.toBitmap();let lit=0;if(b)for(let i=0;i<b.length;i+=4)if(b[i]+b[i+1]+b[i+2]>15)lit++;samples.push({protect,apiEnabled:w.isContentProtected(),listed:!!source,width:source?.thumbnail.getSize().width||0,nonBlackPixels:lit});}return {windowsVersion:process.getSystemVersion(),electron:process.versions.electron,captureMethod:'Electron desktopCapturer window thumbnail (Windows capture backend)',samples};});
 await writeFile('test-results/capture-protection.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await app.close();}
