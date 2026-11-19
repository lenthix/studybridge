import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export const ScanCommand = z.object({
  id:z.string().uuid(), device:z.string().min(1).max(100),
  sessionId:z.string().min(1).max(100), captureToken:z.string().uuid(),
  expires:z.number().int()
}).strict();

/** A new desktop approval creates a new token. Old requests cannot cross Stop,
 * Pause, a source change, or a new study session. No captures run on a timer. */
export class ScanControl {
  token='';
  private seen=new Set<string>();
  arm(){this.token=randomUUID();this.seen.clear();return this.token;}
  disarm(){this.token='';this.seen.clear();}
  accept(raw:unknown,sessionId:string,ready:boolean,now=Date.now()){
    const parsed=ScanCommand.safeParse(raw);
    if(!parsed.success||!ready||!this.token)return false;
    const c=parsed.data;
    if(c.captureToken!==this.token||c.sessionId!==sessionId||c.expires<=now||this.seen.has(c.id))return false;
    this.seen.add(c.id);
    // The relay also limits accepted commands; keep local memory bounded.
    if(this.seen.size>200)this.seen.delete(this.seen.values().next().value!);
    return true;
  }
}
