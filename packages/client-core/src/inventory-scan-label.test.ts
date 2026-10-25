import test from 'node:test';import assert from 'node:assert/strict';
import {createInventoryScanLabel,inventoryScanLabelTitle} from './inventory-scan-label.js';
const token='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
test('label request owns its lifecycle and discards private data on failure/disposal',async()=>{
 let fail=false;const model=createInventoryScanLabel({origin:'https://piano.example',dealerID:'shop',load:async()=>{if(fail)throw Error('denied');return {token};},classify:()=> 'denied'});
 await model.load();assert.ok(model.snapshot().value?.link.includes('#v=1'));const first=model.snapshot().value!.matrix[0]![0];model.snapshot().value!.matrix[0]![0]=!first;assert.equal(model.snapshot().value!.matrix[0]![0],first);
 fail=true;await model.load();assert.equal(model.snapshot().value,null);assert.equal(model.snapshot().issue,'denied');model.dispose();assert.equal(model.snapshot().value,null);
 let resolve!:(value:{token:string})=>void;let signal:AbortSignal|undefined;const pending=createInventoryScanLabel({origin:'https://piano.example',dealerID:'shop',load:s=>{signal=s;return new Promise(r=>resolve=r);},classify:()=> 'unavailable'});
 const work=pending.load();pending.dispose();assert.equal(signal?.aborted,true);resolve({token});await work;assert.equal(pending.snapshot().value,null);
});

test('label identity uses saved make/model and stock when custom title is empty',()=>{assert.equal(inventoryScanLabelTitle({title:'',make:'Yamaha',model:'C3',stock_number:'PT-1'}),'Yamaha C3');assert.equal(inventoryScanLabelTitle({title:'',make:'',model:'',stock_number:'PT-1'}),'PT-1');});
