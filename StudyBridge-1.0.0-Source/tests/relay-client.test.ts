import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RelayClient} from '../src/relay-client';
test('expired sessions can be cleared without blocking the next pairing',async()=>{const c=new RelayClient();c.id='old';c.secret='old-secret';c.expires=Date.now()-1;let calls=0;c.request=async()=>{calls++;throw Error('unreachable');};await c.disconnect();assert.equal(c.id,'');assert.equal(c.secret,'');assert.equal(calls,0);});
test('server-expired sessions clear locally; network failures do not claim revocation',async()=>{const c=new RelayClient();c.id='old';c.expires=Date.now()+60000;c.request=async()=>{throw Error('Pairing session expired. Reconnect your phone.');};await c.disconnect();assert.equal(c.id,'');c.id='still-active';c.request=async()=>{throw Error('offline');};await assert.rejects(c.disconnect(),/revocation could not reach relay/);assert.equal(c.id,'still-active');});
