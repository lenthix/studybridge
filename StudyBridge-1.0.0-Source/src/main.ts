import {app,BrowserWindow,ipcMain,desktopCapturer,dialog,safeStorage,session,nativeImage} from 'electron';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {Settings,Material,type Config,type MaterialData} from './shared';
import {Engine} from './engine';
import {OpenAIProvider} from './provider';
import {RelayClient} from './relay-client';
import {ScanControl} from './scan-control';
let win:BrowserWindow,config:Config=Settings.parse({}),engine:Engine,key='',selected='',capturing=false,captureGeneration=0,started=false;
const relay=new RelayClient();const scanControl=new ScanControl();let available=new Set<string>(),historyTimer:ReturnType<typeof setTimeout>|undefined;let historyWrites:Promise<void>=Promise.resolve();
const entry=path.join(__dirname,'ui/index.html');
if(process.env.STUDYBRIDGE_TEST_PROFILE)app.setPath('userData',process.env.STUDYBRIDGE_TEST_PROFILE);
const store=(name:string)=>path.join(app.getPath('userData'),name);
async function encrypt(value:string){if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Windows credential encryption is unavailable. Nothing was saved.');return safeStorage.encryptStringAsync(value);}
async function decrypt(value:Buffer){if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');const result=await safeStorage.decryptStringAsync(value);return result.result;}
function emit(){if(win&&!win.isDestroyed())win.webContents.send('state',{snapshot:engine.state,relay:relay.publicState()});}
function haltCapture(){captureGeneration++;engine.state.capture=false;}
function disarm(){scanControl.disarm();haltCapture();}
function processing(){return engine.state.items.some(i=>['processing','discovered'].includes(i.status))||engine.state.batches.some(b=>['processing','discovered'].includes(b.status));}
function phoneReady(){return !!scanControl.token&&!!selected&&!!key&&!capturing&&!processing();}
function arm(){scanControl.arm();engine.state.status='Ready — tap Scan now on your phone';engine.publish();}
async function capture(){
 if(capturing||!selected)return;
 capturing=true;const gen=captureGeneration;engine.state.capture=true;engine.state.status='Taking requested snapshot';engine.publish();
 try{
  const sources=await desktopCapturer.getSources({types:[selected.startsWith('screen:')?'screen':'window'],thumbnailSize:{width:1920,height:1080}});
  if(gen!==captureGeneration)return;
  const src=sources.find(s=>s.id===selected);
  if(!src||src.thumbnail.isEmpty()){disarm();engine.pause('Selected source is unavailable. Select it again to resume.');return;}
  const before=engine.state.batches.length;
  engine.state.preview=src.thumbnail.toDataURL();engine.state.source=src.name.slice(0,180);
  engine.enqueue({label:src.name.slice(0,180),text:'Read only the visible selected source.',images:[{id:'selected-source',data:engine.state.preview}]});
  if(engine.state.batches.length===before&&scanControl.token)engine.state.status='No change — existing answers are still current';
 }catch{if(gen===captureGeneration){disarm();engine.pause('Capture unavailable. Select a source again.');}}
 finally{capturing=false;if(gen===captureGeneration){engine.state.capture=false;engine.publish();}}
}
function onChange(){
 if(/limit reached|^Stopped|^Paused/.test(engine.state.status))scanControl.disarm();
 engine.state.phoneReady=phoneReady();engine.state.captureToken=scanControl.token;
 relay.update(engine.state);emit();clearTimeout(historyTimer);if(config.history)historyTimer=setTimeout(()=>void saveHistory(),700);
}
async function saveHistory(){historyWrites=historyWrites.then(async()=>{if(!config.history)return;try{const bytes=await encrypt(JSON.stringify(engine.state));if(config.history)await writeFile(store('history.enc'),bytes);}catch{engine.state.status='History could not be encrypted or saved.';emit();}});await historyWrites;}
async function saveConfig(){await writeFile(store('settings.json'),JSON.stringify(config,null,2));}
const commands=z.discriminatedUnion('type',[
 z.object({type:z.literal('settings'),settings:Settings,key:z.string().max(1000).optional()}),z.object({type:z.literal('sources')}),z.object({type:z.literal('select'),id:z.string().max(200)}),z.object({type:z.literal('import')}),
 z.object({type:z.literal('start'),consent:z.literal(true),sourceId:z.string().max(200).optional(),materials:z.array(Material).max(30)}),
 z.object({type:z.enum(['pause','resume','stop','reset','deleteHistory','connect','disconnect','newCode','deleteKey','history'])}),
 z.object({type:z.enum(['retry','cancel','approve','revoke']),id:z.string().max(100),confirmed:z.boolean().optional()})
]);
async function command(raw:unknown){const c=commands.parse(raw);switch(c.type){
case 'settings':{if(engine.state.capture||engine.state.items.some(i=>i.status==='processing')||engine.state.batches.some(b=>b.status==='processing'))throw Error('Stop processing before changing settings.');if(c.settings.relayUrl){const u=new URL(c.settings.relayUrl);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Use an HTTPS viewer origin only.');}if(c.key){await writeFile(store('key.enc'),await encrypt(c.key.trim()));key=c.key.trim();}config=c.settings;engine.config=config;engine.provider=new OpenAIProvider(key||'not-configured',config);for(const w of BrowserWindow.getAllWindows())w.setContentProtection(config.protect);if(!config.history){clearTimeout(historyTimer);await historyWrites;await unlink(store('history.enc')).catch(()=>{});}await saveConfig();return {config,hasKey:!!key};}
case 'deleteKey':started=false;disarm();engine.stop();key='';await unlink(store('key.enc')).catch(()=>{});engine.provider=new OpenAIProvider('not-configured',config);return true;
case 'sources':{const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:360,height:220}});available=new Set(sources.map(s=>s.id));return sources.filter(s=>s.name!=='StudyBridge').map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));}
case 'select':if(!available.has(c.id))throw Error('Choose a source from the current list.');started=false;disarm();engine.pause('Source selected. Enable phone scans to continue.');selected=c.id;return true;
case 'import':{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Study material',extensions:['png','jpg','jpeg','webp','pdf']}]});if(r.canceled)return [];if(r.filePaths.length>20)throw Error('Import at most 20 files at a time.');const out=[];for(const f of r.filePaths){const buf=await readFile(f);if(buf.length>20_000_000)throw Error('Each file must be under 20 MB.');const ext=path.extname(f).toLowerCase();if(ext==='.pdf'){out.push({label:path.basename(f).slice(0,180),pdf:buf.toString('base64')});continue;}let im=nativeImage.createFromBuffer(buf);if(im.isEmpty())throw Error('The image could not be read.');const size=im.getSize();if(Math.max(size.width,size.height)>2400)im=im.resize(size.width>size.height?{width:2400}:{height:2400});out.push({label:path.basename(f).slice(0,180),image:'data:image/jpeg;base64,'+im.toJPEG(92).toString('base64')});}return out;}
case 'start':{
 if(!key)throw Error('Enter an API key in Settings first.');
 if(engine.state.status==='Stopped')throw Error('Start a new session after stopping.');
 if(!c.materials.length&&(!selected||c.sourceId!==selected))throw Error('Choose a source or add study material.');
 if(Buffer.byteLength(JSON.stringify(c.materials))>24_000_000)throw Error('This batch is too large. Import fewer pages or smaller images (24 MB maximum).');
 disarm();started=true;engine.resume();
 if(c.materials.length){selected='';for(const m of c.materials)engine.enqueue(m);}
 else arm();
 return true;
}
case 'pause':disarm();engine.pause();return true;
case 'resume':if(!started||!key)throw Error('Choose material, approve sharing, and click Start first.');disarm();engine.resume();if(selected)arm();return true;
case 'stop':started=false;disarm();engine.stop();return true;
case 'reset':started=false;disarm();engine.reset();selected='';return true;
case 'cancel':engine.cancel(c.id);return true;
case 'retry':if(!c.confirmed)throw Error('Confirm that retrying may incur another charge.');engine.retry(c.id);return true;
case 'connect':await relay.connect(config.relayUrl);relay.update(engine.state);return relay.publicState();
case 'disconnect':disarm();engine.publish();await relay.disconnect();return true;
case 'newCode':await relay.codeAgain();return true;
case 'approve':await relay.approve(c.id);return true;
case 'revoke':await relay.revoke(c.id);return true;
case 'deleteHistory':config.history=false;await saveConfig();clearTimeout(historyTimer);await historyWrites;await unlink(store('history.enc')).catch(()=>{});started=false;disarm();engine.reset();return true;
case 'history':try{return JSON.parse(await decrypt(await readFile(store('history.enc'))));}catch{return null;}
}}
app.whenReady().then(async()=>{
 await mkdir(app.getPath('userData'),{recursive:true});try{config=Settings.parse(JSON.parse(await readFile(store('settings.json'),'utf8')));}catch{}
 let credentialError='';try{key=await decrypt(await readFile(store('key.enc')));}catch(e:any){if(e.code!=='ENOENT')credentialError='Saved key could not be decrypted. Re-enter it in Settings.';}
 engine=new Engine(config,new OpenAIProvider(key||'not-configured',config));engine.on('change',onChange);relay.on('change',emit);
 relay.on('scan',raw=>{if(scanControl.accept(raw,engine.state.sessionId,phoneReady())){engine.state.lastScanId=raw.id;void capture();}});
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 win=new BrowserWindow({width:1320,height:900,minWidth:900,minHeight:650,title:'StudyBridge',backgroundColor:'#101722',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});win.setMenu(null);win.setContentProtection(config.protect);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-attach-webview',e=>e.preventDefault());
 const check=(e:Electron.IpcMainInvokeEvent)=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==pathToFileURL(entry).href)throw Error('Unauthorized app frame.');};
 ipcMain.handle('init',e=>{check(e);return {config,hasKey:!!key,snapshot:engine.state,relay:relay.publicState(),credentialError};});
 ipcMain.handle('command',async(e,raw)=>{check(e);try{return {ok:true,value:await command(raw)};}catch(err){return {ok:false,error:err instanceof z.ZodError?'Invalid input. Check the form values.':(err as Error).message};}});
 await win.loadFile(entry);win.on('closed',()=>{disarm();engine.stop();void relay.disconnect().catch(()=>{});});
});
app.on('window-all-closed',()=>app.quit());



