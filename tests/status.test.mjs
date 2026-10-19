import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Classifier} from '../dist/status.js';
const fast={ok:true,ms:100,reason:'OK'}, slow={ok:true,ms:1600,reason:'OK'}, fail={ok:false,ms:0,reason:'Timeout'};
test('two successful checks establish green, including a failed provider',()=>{const c=new Classifier();assert.equal(c.update([fast,fail],'full',1500),'checking');assert.equal(c.update([fast,fail],'full',1500),'connected');});
test('slow checks produce poor and two fast checks recover',()=>{const c=new Classifier();c.update([slow],'full',1500);assert.equal(c.update([slow],'full',1500),'poor');assert.equal(c.update([fast],'full',1500),'poor');assert.equal(c.update([fast],'full',1500),'connected');});
test('offline requires corroboration',()=>{const c=new Classifier();for(let i=0;i<3;i++)c.update([fail],'full',1500);assert.equal(c.state,'checking');assert.equal(c.update([fail],'limited',1500),'offline');});
test('portal and missing route override probe success',()=>{const c=new Classifier();assert.equal(c.update([fast],'portal',1500),'portal');assert.equal(c.update([fast],'none',1500),'offline');});
test('reset drops old evidence',()=>{const c=new Classifier();c.update([fast],'full',1500);c.reset();assert.equal(c.update([fast],'full',1500),'checking');});
