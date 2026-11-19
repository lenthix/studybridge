import express from 'express';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import path from 'node:path';
import {z} from 'zod';
import {Question,Answer,Material} from '../src/shared';
const token=()=>randomBytes(32).toString('base64url');
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const SnapshotSchema=z.object({assets:z.record(z.string(),z.string().max(12_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)),sessionId:z.string().max(100),revision:z.number().int().nonnegative(),status:z.string().max(300),items:z.array(z.object({id:z.string().max(100),number:z.number().int(),status:z.enum(['discovered','processing','answered','failed','cancelled']),question:Question,passageRef:z.string().max(100).optional(),answer:Answer.optional(),error:z.string().max(1000).optional(),material:Material.omit({images:true}).extend({images:z.array(z.object({id:z.string().max(100),data:z.string().regex(/^asset:[0-9]+$/)})).max(20)})})).max(500),batches:z.array(z.object({id:z.string(),label:z.string(),status:z.string(),error:z.string().optional()})).max(100),requests:z.number(),reserved:z.number(),estimated:z.number(),capture:z.boolean(),source:z.string().max(300),preview:z.string().max(12_000_000)});
type Device={id:string;name:string;proof:string;secret:string;approved:boolean;expires:number;sockets:Set<WebSocket>};
type Session={id:string;secret:string;expires:number;code:string;codeExpires:number;devices:Map<string,Device>;snapshot:any;seen:number;bytes:number};
export function createRelay(options:{origin?:string;now?:()=>number;ttl?:number;codeTtl?:number;staticDir?:string}={}){
  const now=options.now||Date.now,ttl=options.ttl||7200000,codeTtl=options.codeTtl||300000;
  const sessions=new Map<string,Session>(),buckets=new Map<string,{n:number;at:number}>();
  const api=express();api.disable('x-powered-by');api.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
  api.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), display-capture=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});if(options.origin&&req.headers.origin&&req.headers.origin!==options.origin)return res.sendStatus(403);next();});
  api.use('/api',(req,res,next)=>{const key=req.ip||req.socket.remoteAddress||'unknown';let b=buckets.get(key);if(!b||now()-b.at>60000){b={n:0,at:now()};buckets.set(key,b);}if(++b.n>180)return res.status(429).json({error:'Too many requests. Wait one minute.'});next();});
  api.use(express.json({limit:'30mb'}));
  const bearer=(req:any)=>digest(String(req.headers.authorization||'').replace(/^Bearer /,''));
  const live=(s:Session|undefined)=>s&&s.expires>now()?s:undefined;
  const owner=(req:any,res:any,next:any)=>{const s=live(sessions.get(req.params.id));if(!s||bearer(req)!==s.secret)return res.sendStatus(401);req.study=s;next();};
  function broadcast(s:Session,statusOnly=false){for(const d of s.devices.values())if(d.approved)for(const ws of d.sockets)if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:statusOnly?'status':'snapshot',snapshot:statusOnly?undefined:s.snapshot,desktopOnline:now()-s.seen<45000}));}
  function close(s:Session){for(const d of s.devices.values())for(const ws of d.sockets)ws.close(4001,'Session expired or disconnected');sessions.delete(s.id);}
  api.get('/health',(_q,r)=>r.json({ok:true}));
  api.post('/api/sessions',(req,res)=>{if(sessions.size>=20)return res.sendStatus(503);const secret=token(),id=token(),s:Session={id,secret:digest(secret),expires:now()+ttl,code:randomBytes(5).toString('hex').toUpperCase(),codeExpires:now()+codeTtl,devices:new Map(),snapshot:null,seen:now(),bytes:0};sessions.set(id,s);res.json({id,secret,code:s.code,expires:s.expires,codeExpires:s.codeExpires});});
  api.post('/api/sessions/:id/code',owner,(req:any,res)=>{const s=req.study as Session;s.code=randomBytes(5).toString('hex').toUpperCase();s.codeExpires=now()+codeTtl;res.json({code:s.code,codeExpires:s.codeExpires});});
  api.get('/api/sessions/:id/devices',owner,(req:any,res)=>res.json([...req.study.devices.values()].map((d:any)=>({id:d.id,name:d.name,proof:d.proof,approved:d.approved}))));
  api.post('/api/sessions/:id/heartbeat',owner,(req:any,res)=>{req.study.seen=now();res.json({ok:true});});
  api.post('/api/sessions/:id/snapshot',owner,(req:any,res)=>{const p=SnapshotSchema.safeParse(req.body);if(!p.success||p.data.items.some(i=>i.material.images.some(im=>!p.data.assets[im.data])))return res.sendStatus(400);const s=req.study as Session;const size=Buffer.byteLength(JSON.stringify(p.data));if([...sessions.values()].reduce((sum,item)=>sum+item.bytes,0)-s.bytes+size>64_000_000)return res.status(503).json({error:'Relay memory limit reached. Try a smaller session.'});s.bytes=size;if(!s.snapshot||s.snapshot.sessionId!==p.data.sessionId||p.data.revision>=s.snapshot.revision)s.snapshot=p.data;s.seen=now();broadcast(s);res.json({ok:true});});
  api.post('/api/sessions/:id/devices/:device/approve',owner,(req:any,res)=>{const s=req.study as Session,d=s.devices.get(req.params.device);if(!d||d.expires<now())return res.sendStatus(404);d.approved=true;broadcast(s);res.json({ok:true});});
  api.delete('/api/sessions/:id/devices/:device',owner,(req:any,res)=>{const s=req.study as Session,d=s.devices.get(req.params.device);if(d){for(const ws of d.sockets)ws.close(4003,'Access revoked');s.devices.delete(d.id);}res.json({ok:true});});
  api.delete('/api/sessions/:id',owner,(req:any,res)=>{close(req.study);res.json({ok:true});});
  api.post('/api/join',(req,res)=>{
    const key='join:'+(req.ip||req.socket.remoteAddress);let b=buckets.get(key);if(!b||now()-b.at>60000){b={n:0,at:now()};buckets.set(key,b);}if(++b.n>5)return res.status(429).json({error:'Too many pairing attempts. Wait one minute.'});
    const p=z.object({code:z.string().regex(/^[A-F0-9]{10}$/),name:z.string().trim().min(1).max(60)}).safeParse(req.body);if(!p.success)return res.sendStatus(400);
    const s=[...sessions.values()].find(s=>live(s)&&s.code===p.data.code&&s.codeExpires>now());if(!s||s.devices.size>=8)return res.status(404).json({error:'Code expired or already used. Ask the desktop for a new code.'});
    s.code='';const secret=token(),d:Device={id:token(),name:p.data.name,proof:randomBytes(3).toString('hex').toUpperCase(),secret:digest(secret),approved:false,expires:now()+codeTtl,sockets:new Set()};s.devices.set(d.id,d);res.json({session:s.id,device:d.id,secret,proof:d.proof,expires:s.expires});
  });
  api.get('/api/sessions/:id/devices/:device/status',(req,res)=>{const s=live(sessions.get(req.params.id)),d=s?.devices.get(req.params.device);if(!s||!d||d.secret!==bearer(req)||(!d.approved&&d.expires<now()))return res.sendStatus(401);res.json({approved:d.approved});});
  if(options.staticDir)api.use(express.static(options.staticDir,{index:'index.html'}));
  api.use((e:any,_q:any,res:any,_n:any)=>res.status(e?.status===413?413:400).json({error:'Invalid or oversized request.'}));
  const server=createServer(api),wss=new WebSocketServer({server,maxPayload:2048});
  wss.on('connection',(ws,req)=>{ws.on('error',()=>ws.terminate());if(wss.clients.size>200){ws.close(1013,'Relay busy');return;}if(options.origin&&req.headers.origin!==options.origin){ws.close(4003,'Origin denied');return;}let authenticated=false;const deadline=setTimeout(()=>ws.close(4003,'Authentication required'),5000);ws.once('close',()=>clearTimeout(deadline));ws.on('message',raw=>{if(authenticated){ws.close(4003,'Read only viewer');return;}try{const p=JSON.parse(raw.toString()),s=live(sessions.get(p.session)),d=s?.devices.get(p.device);if(!s||!d||!d.approved||d.secret!==digest(String(p.secret))){ws.close(4003,'Access denied');return;}authenticated=true;clearTimeout(deadline);d.sockets.add(ws);ws.once('close',()=>d.sockets.delete(ws));ws.send(JSON.stringify({type:'snapshot',snapshot:s.snapshot,desktopOnline:now()-s.seen<45000}));}catch{ws.close(4003,'Invalid authentication');}});});
  const sweep=setInterval(()=>{for(const s of sessions.values()){if(s.expires<=now()){close(s);continue;}for(const d of s.devices.values())if(!d.approved&&d.expires<now())s.devices.delete(d.id);broadcast(s,true);}for(const[k,b]of buckets)if(now()-b.at>60000)buckets.delete(k);},10000);sweep.unref();
  return {server,sessions,shutdown:async()=>{clearInterval(sweep);for(const s of sessions.values())close(s);wss.close();await new Promise<void>(r=>server.close(()=>r()));}};
}
if(require.main===module){const origin=process.env.PUBLIC_ORIGIN;if(!origin||(!origin.startsWith('https://')&&process.env.ALLOW_LOCAL_HTTP!=='1'))throw Error('Set PUBLIC_ORIGIN to the deployed HTTPS origin. Local tests may set ALLOW_LOCAL_HTTP=1.');const relay=createRelay({origin,staticDir:path.resolve(process.env.STATIC_DIR||'dist/ui')});relay.server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('StudyBridge relay ready. Request bodies and credentials are not logged.'));}



