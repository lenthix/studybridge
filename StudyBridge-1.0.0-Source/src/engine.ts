import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Extraction,validateAnswer,type Config,type MaterialData,type Snapshot,type Item} from './shared';
import {friendlyError,type Provider} from './provider';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export class Engine extends EventEmitter {
  state:Snapshot={sessionId:randomUUID(),revision:0,status:'Ready',items:[],batches:[],requests:0,reserved:0,estimated:0,capture:false,source:'',preview:''};
  private generation=0; private active=new Map<string,AbortController>();private seen=new Set<string>();private questionSeen=new Set<string>();private materials=new Map<string,MaterialData>();private pending:string[]=[];private extracting=false;private paused=false;
  constructor(public config:Config,public provider:Provider){super();}
  publish(){this.state.revision++;this.emit('change',this.state);}
  reset(){this.stop();this.generation++;this.seen.clear();this.questionSeen.clear();this.materials.clear();this.pending=[];this.state={sessionId:randomUUID(),revision:0,status:'Ready',items:[],batches:[],requests:0,reserved:0,estimated:0,capture:false,source:'',preview:''};this.paused=false;this.publish();}
  stop(){this.generation++;for(const c of this.active.values())c.abort();this.active.clear();this.pending=[];this.extracting=false;this.paused=true;for(const i of this.state.items)if(['processing','discovered'].includes(i.status))i.status='cancelled';for(const b of this.state.batches)if(['processing','discovered'].includes(b.status))b.status='cancelled';this.state.capture=false;this.state.status='Stopped';this.publish();}
  pause(reason='Paused'){this.paused=true;this.state.capture=false;this.state.status=reason;this.publish();}
  resume(){this.paused=false;this.state.status='Processing';this.publish();void this.extractNext();this.pump();}
  enqueue(m:MaterialData){if(this.state.batches.length>=100){this.pause('Session input limit reached. Start a new session.');return;}const key=hash(JSON.stringify({text:m.text,images:m.images.map(i=>i.data)}));if(this.seen.has(key))return;this.seen.add(key);const id=randomUUID();this.materials.set(id,m);this.state.batches.push({id,label:m.label,status:'discovered'});this.pending.push(id);this.publish();void this.extractNext();}
  reserve(m:MaterialData,extra=''){
    // One UTF-8 byte per text token plus schema/prompt allowance; deliberately high image envelope.
    const input=Buffer.byteLength(m.text+extra)+8192+m.images.length*65536;
    const amount=(input*this.config.inputPrice+8192*this.config.outputPrice)/1e6;
    if(this.state.requests>=this.config.maxRequests||this.state.reserved+amount>this.config.budget){this.pause('Request or estimated spending limit reached.');throw Error('Limit');}
    this.state.requests++;this.state.reserved+=amount;this.publish();return amount;
  }
  private account(usage:any){if(usage)this.state.estimated+=(usage.input_tokens*this.config.inputPrice+usage.output_tokens*this.config.outputPrice)/1e6;}
  private async extractNext(){
    if(this.paused||this.extracting||!this.pending.length||this.active.size>=this.config.concurrency)return;
    const id=this.pending.shift()!,batch=this.state.batches.find(b=>b.id===id)!,m=this.materials.get(id)!,gen=this.generation;
    try{this.reserve(m);}catch{this.pending.unshift(id);return;}
    this.extracting=true;const c=new AbortController();this.active.set(id,c);batch.status='processing';this.publish();
    try{const r=await this.provider.extract(m,c.signal);if(gen!==this.generation||c.signal.aborted)return;this.account(r.usage);const parsed=Extraction.parse(r.value);
      for(const q of parsed.questions){const key=hash(JSON.stringify({...q,text:q.text.replace(/\s+/g,' ').trim(),imageRefs:[]}));if(this.questionSeen.has(key))continue;this.questionSeen.add(key);const item:Item={id:key,number:this.state.items.length+1,status:'discovered',question:q,passageRef:q.passage?hash(q.passage):undefined,material:{...m,images:m.images.filter(im=>q.imageRefs.includes(im.id)||q.missingInformation)}};this.state.items.push(item);}
      batch.status=parsed.questions.length?'answered':'failed';batch.error=parsed.warnings.join(' ')||(!parsed.questions.length?'Extraction error: no readable questions found.':undefined);
    }catch(e){if(gen===this.generation){batch.status='failed';batch.error='Extraction error: '+friendlyError(e);}}
    finally{if(gen===this.generation){this.active.delete(id);this.extracting=false;this.publish();void this.extractNext();this.pump();}}
  }
  private pump(){if(this.paused)return;for(const item of this.state.items){if(this.paused||this.active.size>=this.config.concurrency)break;if(item.status==='discovered'&&!this.active.has(item.id))void this.solve(item);}void this.extractNext();if(!this.paused&&!this.active.size&&!this.pending.length){this.state.status=this.state.capture?'Watching selected source':'Complete';this.publish();}}
  private async solve(item:Item){
    try{this.reserve(item.material,JSON.stringify(item.question));}catch{return;}
    const gen=this.generation,c=new AbortController();this.active.set(item.id,c);item.status='processing';this.publish();
    try{const r=await this.provider.answer(item.question,item.material,c.signal);if(gen!==this.generation||c.signal.aborted)return;this.account(r.usage);item.answer=validateAnswer(item.question,r.value,item.material.images.map(i=>i.id));item.status='answered';item.error=undefined;}
    catch(e){if(gen===this.generation&&!c.signal.aborted){item.status='failed';item.error='AI answer error: '+friendlyError(e);}}
    finally{if(gen===this.generation){this.active.delete(item.id);this.publish();this.pump();}}
  }
  cancel(id:string){this.active.get(id)?.abort();const i=this.state.items.find(i=>i.id===id);if(i)i.status='cancelled';const b=this.state.batches.find(b=>b.id===id);if(b)b.status='cancelled';this.pending=this.pending.filter(x=>x!==id);this.publish();}
  retry(id:string){const i=this.state.items.find(i=>i.id===id);if(i&&['failed','cancelled'].includes(i.status)){i.status='discovered';i.error=undefined;}const b=this.state.batches.find(b=>b.id===id);if(b&&['failed','cancelled'].includes(b.status)){b.status='discovered';b.error=undefined;this.pending.push(id);}this.resume();}
}


