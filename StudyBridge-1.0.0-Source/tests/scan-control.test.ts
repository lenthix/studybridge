import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ScanControl} from '../src/scan-control';
test('scan commands require current consent, readiness, session and expiry; cannot replay',()=>{
 const control=new ScanControl();
 const command={id:randomUUID(),device:'phone',sessionId:'session',captureToken:control.arm(),expires:2000};
 assert.equal(control.accept(command,'session',false,1000),false);
 assert.equal(control.accept(command,'other',true,1000),false);
 assert.equal(control.accept(command,'session',true,2000),false);
 assert.equal(control.accept({...command,unexpected:true},'session',true,1000),false);
 assert.equal(control.accept(command,'session',true,1000),true);
 assert.equal(control.accept(command,'session',true,1000),false);
 control.disarm();assert.equal(control.accept({...command,id:randomUUID()},'session',true,1000),false);
 control.arm();assert.equal(control.accept({...command,id:randomUUID()},'session',true,1000),false);
 assert.equal(control.accept({...command,id:randomUUID(),captureToken:control.token},'session',true,1000),true);
});
