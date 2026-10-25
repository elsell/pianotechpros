import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryScanView} from './inventory-scan-view';
import {createInventoryScanLink} from './inventory-scan-link';
const origin='https://piano.example';
const link=createInventoryScanLink(origin,'shop','AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE');
const record={id:'piano',dealer_id:'shop',attributes:{title:'Saved piano'}};
test('scan validates before any request and resolves before a scoped record read',async()=>{
 const calls:string[]=[];
 const model=createInventoryScanView({origin,resolve:async(dealer,token)=>{calls.push('resolve');assert.equal(dealer,'shop');assert.equal(token.length,43);return {dealer_id:dealer,record_id:'piano'};},read:async(dealer,id)=>{calls.push('read');assert.equal(dealer,'shop');assert.equal(id,'piano');return record;},classify:()=> 'unavailable'});
 for(const invalid of ['https://evil.example/scan'+new URL(link).hash,link+'&extra=1','garbage']){await model.open(invalid);assert.equal(model.snapshot().issue,'invalid');assert.deepEqual(calls,[]);}
 await model.open(link);assert.deepEqual(calls,['resolve','read']);assert.deepEqual(model.snapshot().record,record);assert.ok(!JSON.stringify(model.snapshot()).includes('token'));
 model.snapshot().record!.attributes.title='Changed';assert.equal(model.snapshot().record!.attributes.title,'Saved piano');model.dispose();assert.equal(model.snapshot().record,null);
});
test('resolution scope and record identity disagreement fail closed',async()=>{
 for(const mismatch of ['resolution','record']){
 let reads=0;const model=createInventoryScanView({origin,resolve:async()=>({dealer_id:mismatch==='resolution'?'other':'shop',record_id:'piano'}),read:async()=>{reads++;return {...record,id:'other'};},classify:()=> 'unavailable'});
 await model.open(link);assert.equal(model.snapshot().record,null);assert.equal(model.snapshot().issue,'unavailable');assert.equal(reads,mismatch==='resolution'?0:1);
 }
});
test('fresh retries repeat authority and denial clears previously shown data',async()=>{
 let failure:'none'|'network'|'denied'='none';let resolutions=0;
 const model=createInventoryScanView({origin,resolve:async()=>{resolutions++;if(failure!=='none')throw failure;return {dealer_id:'shop',record_id:'piano'};},read:async()=>record,classify:e=>e==='denied'?'denied':'unavailable'});
 await model.open(link);failure='network';await model.retry();assert.equal(model.snapshot().record,null);assert.equal(model.snapshot().issue,'unavailable');failure='none';await model.retry();assert.ok(model.snapshot().record);failure='denied';await model.retry();assert.equal(model.snapshot().record,null);assert.equal(model.snapshot().issue,'denied');await model.retry();assert.equal(resolutions,4);
});
test('new scans and disposal abort work and ignore late results',async()=>{
 let finish!:(value:{dealer_id:string;record_id:string})=>void;let signal:AbortSignal|undefined;let reads=0;
 const model=createInventoryScanView({origin,resolve:async(_d,_t,s)=>{signal=s;return new Promise(r=>finish=r);},read:async()=>{reads++;return record;},classify:()=> 'unavailable'});
 const pending=model.open(link);await model.open('invalid');assert.equal(signal?.aborted,true);finish({dealer_id:'shop',record_id:'piano'});await pending;assert.equal(reads,0);assert.equal(model.snapshot().issue,'invalid');
 const next=model.open(link);model.dispose();assert.equal(signal?.aborted,true);finish({dealer_id:'shop',record_id:'piano'});await next;assert.equal(reads,0);assert.equal(model.snapshot().record,null);
});
