import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createRelay} from '../relay/server';
import {Engine} from '../src/engine';
import {Settings} from '../src/shared';
import {randomUUID} from 'node:crypto';
async function setup(){let time=1000;const r=createRelay({now:()=>time,ttl:10000,codeTtl:1000});r.server.listen(0,'127.0.0.1');await once(r.server,'listening');const port=(r.server.address() as any).port;const base='http://127.0.0.1:'+port;const req=async(route:string,method='GET',body?:any,secret?:string)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...(secret?{Authorization:'Bearer '+secret}:{})},body:body?JSON.stringify(body):undefined});const owner=await(await req('/api/sessions','POST')).json();return {r,base,req,owner,time:(v:number)=>time=v};}
test('phone scans require paired credentials and current consent; delivery is single-use and revocable',async()=>{const t=await setup();try{
 const d=await(await t.req('/api/join','POST',{code:t.owner.code,name:'Phone'})).json();
 const route=`/api/sessions/${t.owner.id}`,device=route+`/devices/${d.device}`;
 const e=new Engine(Settings.parse({}),{} as any);const snapshot={...e.state,assets:{},phoneReady:true,captureToken:randomUUID()};
 const command={id:randomUUID(),sessionId:snapshot.sessionId,captureToken:snapshot.captureToken};
 assert.equal((await t.req(device+'/scan','POST',command,d.secret)).status,409);

 await t.req(route+'/snapshot','POST',snapshot,t.owner.secret);
 assert.equal((await t.req(device+'/scan','POST',command,'wrong')).status,401);
 assert.equal((await t.req(device+'/scan','POST',{...command,captureToken:randomUUID()},d.secret)).status,409);
 assert.equal((await t.req(device+'/scan','POST',command,d.secret)).status,200);
 assert.equal((await(await t.req(device+'/scan','POST',command,d.secret)).json()).duplicate,true);
 assert.equal((await t.req(device+'/scan','POST',{...command,id:randomUUID()},d.secret)).status,429);
 assert.equal((await(await t.req(route+'/heartbeat','POST',{},t.owner.secret)).json()).scan.id,command.id);
 assert.equal((await(await t.req(route+'/heartbeat','POST',{},t.owner.secret)).json()).scan,null);
 t.time(5000);await t.req(device+'/scan','POST',{...command,id:randomUUID()},d.secret);
 await t.req(device,'DELETE',undefined,t.owner.secret);
 assert.equal((await(await t.req(route+'/heartbeat','POST',{},t.owner.secret)).json()).scan,null);
 }finally{await t.r.shutdown();}});
test('one-use codes connect immediately, with authenticated WS and revocation',async()=>{const t=await setup();try{const d=await(await t.req('/api/join','POST',{code:t.owner.code,name:'Test phone'})).json();assert.equal((await t.req('/api/join','POST',{code:t.owner.code,name:'Intruder'})).status,404);assert.equal((await t.req(`/api/sessions/${t.owner.id}/devices`)).status,401);const bad=new WebSocket(t.base.replace('http','ws'));await once(bad,'open');const denied=once(bad,'close');bad.send(JSON.stringify({...d,secret:'wrong'}));assert.equal((await denied)[0],4003);

 const e=new Engine(Settings.parse({}),{} as any);e.state.status='Test result';const body={...e.state,assets:{},apiKey:'sk-SENTINEL-NEVER-SHARE'};await t.req(`/api/sessions/${t.owner.id}/snapshot`,'POST',body,t.owner.secret);
 const ws=new WebSocket(t.base.replace('http','ws'));await once(ws,'open');const received=once(ws,'message');ws.send(JSON.stringify(d));const data=JSON.parse((await received)[0].toString());assert.equal(data.snapshot.status,'Test result');assert.ok(!JSON.stringify(data).includes('SENTINEL'));assert.equal(data.snapshot.revision,0);
 ws.close();await once(ws,'close');const again=new WebSocket(t.base.replace('http','ws'));await once(again,'open');const replay=once(again,'message');again.send(JSON.stringify(d));assert.equal(JSON.parse((await replay)[0].toString()).snapshot.sessionId,e.state.sessionId);
 const revoked=once(again,'close');await t.req(`/api/sessions/${t.owner.id}/devices/${d.device}`,'DELETE',undefined,t.owner.secret);assert.equal((await revoked)[0],4003);assert.equal((await t.req(`/api/sessions/${t.owner.id}/devices/${d.device}/status`,'GET',undefined,d.secret)).status,401);
 }finally{await t.r.shutdown();}});
test('codes and sessions expire; failed guesses are rate limited',async()=>{const t=await setup();try{t.time(2001);assert.equal((await t.req('/api/join','POST',{code:t.owner.code,name:'Late'})).status,404);for(let i=0;i<4;i++)assert.equal((await t.req('/api/join','POST',{code:'AAAAAAAAAA',name:'Guess'})).status,404);assert.equal((await t.req('/api/join','POST',{code:'AAAAAAAAAA',name:'Guess'})).status,429);t.time(11001);assert.equal((await t.req(`/api/sessions/${t.owner.id}/devices`,'GET',undefined,t.owner.secret)).status,401);}finally{await t.r.shutdown();}});
test('device credentials cannot act as the desktop or impersonate another phone',async()=>{const t=await setup();try{const d=await(await t.req('/api/join','POST',{code:t.owner.code,name:'Phone'})).json();assert.equal((await t.req(`/api/sessions/${t.owner.id}/devices/${d.device}/status`,'GET',undefined,'wrong')).status,401);assert.equal((await t.req(`/api/sessions/${t.owner.id}/snapshot`,'POST',{status:'hijack'},d.secret)).status,401);const status=await(await t.req(`/api/sessions/${t.owner.id}/devices/${d.device}/status`,'GET',undefined,d.secret)).json();assert.deepEqual(status,{approved:true});}finally{await t.r.shutdown();}});
test('oversized unauthenticated WebSocket messages do not crash the relay',async()=>{const t=await setup();try{const ws=new WebSocket(t.base.replace('http','ws'));await once(ws,'open');const closed=once(ws,'close');ws.send('x'.repeat(3000));await closed;assert.equal((await t.req('/health')).status,200);}finally{await t.r.shutdown();}});

