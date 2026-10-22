import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryEditor } from './inventory-editor.js';
const initial={id:'piano',dealer_id:'shop',revision:1,attributes:{title:'Original',price:{minor:100}}};
function fixture(){
 let current=structuredClone(initial);let failure:string|null=null;let commitThenFail=false;let release:(()=>void)|null=null;let calls=0;
 const c=createInventoryEditor({initial,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),classify:(e:unknown)=>e==='denied'?'denied':e==='conflict'?'conflict':e==='validation'?'rejected':'uncertain',
  get:async()=>{if(failure)throw failure;return structuredClone(current);},
  edit:async(a,revision)=>{calls++;if(release)await new Promise<void>(resolve=>{release=resolve;});if(failure)throw failure;if(revision!==current.revision)throw 'conflict';current={...current,revision:revision+1,attributes:structuredClone(a)};if(commitThenFail)throw 'network';return structuredClone(current);},
 });
 return {c,setFailure:(s:string|null)=>{failure=s;},setCurrent:(v:typeof initial)=>{current=v;},getCurrent:()=>current,calls:()=>calls,loseResponse:()=>{commitThenFail=true;},pause:()=>{release=()=>{};},resume:()=>{release?.();release=null;}};
}
test('typing during save survives completion and snapshots do not share nested state',async()=>{
 const f=fixture();f.c.change({title:'First',price:{minor:200}});const snapshot=f.c.snapshot();snapshot.draft!.price.minor=999;assert.equal(f.c.snapshot().draft?.price.minor,200);
 f.pause();const saving=f.c.save();f.c.change({title:'Second',price:{minor:300}});await f.c.save();assert.equal(f.calls(),1);f.resume();await saving;
 assert.equal(f.c.snapshot().draft?.title,'Second');assert.equal(f.c.snapshot().dirty,true);assert.equal(f.c.snapshot().baseline?.attributes.title,'First');await f.c.save();assert.equal(f.getCurrent().attributes.title,'Second');assert.equal(f.c.snapshot().dirty,false);
});
test('lost save response recovers exact revision without overwriting later typing',async()=>{
 const f=fixture();f.loseResponse();f.c.change({title:'Saved remotely',price:{minor:200}});await f.c.save();assert.equal(f.c.snapshot().uncertain,true);
 f.c.change({title:'Still typing',price:{minor:300}});await f.c.recover();assert.equal(f.c.snapshot().uncertain,false);assert.equal(f.c.snapshot().baseline?.revision,2);assert.equal(f.c.snapshot().draft?.title,'Still typing');assert.equal(f.c.snapshot().dirty,true);
});
test('uncertain retry retains original attempted values and revision',async()=>{
 const f=fixture();f.setFailure('network');f.c.change({title:'Attempt',price:{minor:200}});await f.c.save();f.c.change({title:'New typing',price:{minor:300}});f.setFailure(null);await f.c.save();assert.equal(f.getCurrent().attributes.title,'Attempt');assert.equal(f.c.snapshot().draft?.title,'New typing');
});
test('conflicts require explicit fetched-version choice',async()=>{
 const f=fixture();f.setCurrent({...initial,revision:2,attributes:{title:'Other editor',price:{minor:400}}});f.c.change({title:'My edit',price:{minor:200}});await f.c.save();assert.equal(f.c.snapshot().conflict,true);await f.c.save();assert.equal(f.calls(),1);f.c.keepEdits();assert.equal(f.c.snapshot().conflict,true);
 await f.c.recover();f.c.keepEdits();await f.c.save();assert.equal(f.getCurrent().revision,3);assert.equal(f.getCurrent().attributes.title,'My edit');
});
test('denial and disposal clear private data and suppress late results',async()=>{
 for(const dispose of [false,true]){const f=fixture();f.c.change({title:'Private',price:{minor:200}});if(dispose){f.pause();const saving=f.c.save();f.c.dispose();f.resume();await saving;}else{f.setFailure('denied');await f.c.save();}assert.equal(f.c.snapshot().draft,null);assert.equal(f.c.snapshot().baseline,null);}
});
test('invalid fetched identity cannot become the conflict baseline',async()=>{
 const f=fixture();f.c.change({title:'Edit',price:{minor:200}});f.setFailure('conflict');await f.c.save();f.setFailure(null);f.setCurrent({...initial,id:'another',revision:2});await f.c.recover();assert.equal(f.c.snapshot().latest,null);assert.equal(f.c.snapshot().conflict,true);
});

test('validation rejection permits corrected input; transient recovery failure preserves draft',async()=>{
 const f=fixture();f.c.change({title:'Rejected',price:{minor:200}});f.setFailure('validation');await f.c.save();assert.equal(f.c.snapshot().uncertain,false);f.c.change({title:'Corrected',price:{minor:300}});f.setFailure('network');await f.c.save();await f.c.recover();assert.equal(f.c.snapshot().draft?.title,'Corrected');assert.equal(f.c.snapshot().uncertain,true);f.setFailure(null);await f.c.recover();assert.equal(f.c.snapshot().uncertain,true);await f.c.save();assert.equal(f.getCurrent().attributes.title,'Corrected');
});
test('choosing the fetched revision replaces the draft only after explicit review',async()=>{
 const f=fixture();f.c.change({title:'Mine',price:{minor:200}});f.setCurrent({...initial,revision:3,attributes:{title:'Remote',price:{minor:400}}});await f.c.save();f.c.useLatest();assert.equal(f.c.snapshot().draft?.title,'Mine');await f.c.recover();f.c.useLatest();assert.equal(f.c.snapshot().draft?.title,'Remote');assert.equal(f.c.snapshot().dirty,false);assert.equal(f.c.snapshot().conflict,false);
});
test('subscribers cannot mutate internal attributes and no-op save makes no request',async()=>{
 const f=fixture();const unsubscribe=f.c.subscribe(state=>{if(state.baseline)state.baseline.attributes.price.minor=999;if(state.draft)state.draft.price.minor=999;});assert.equal(f.c.snapshot().draft?.price.minor,100);await f.c.save();assert.equal(f.calls(),0);unsubscribe();f.c.dispose();f.c.change({title:'Late',price:{minor:200}});assert.equal(f.c.snapshot().draft,null);
});
