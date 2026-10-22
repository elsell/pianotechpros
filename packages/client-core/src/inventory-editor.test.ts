import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryEditor, isInventoryEditorCheckpoint, type InventoryEditorCheckpoint } from './inventory-editor.js';
const initial={id:'piano',dealer_id:'shop',revision:1,attributes:{title:'Original',price:{minor:100}}};
function fixture(recovery?:InventoryEditorCheckpoint<typeof initial.attributes,typeof initial>){
 let current=structuredClone(initial);let failure:string|null=null;let commitThenFail=false;let release:(()=>void)|null=null;let calls=0;
 const c=createInventoryEditor({initial,recovery,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),classify:(e:unknown)=>e==='denied'?'denied':e==='conflict'?'conflict':e==='validation'?'rejected':'uncertain',
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

test('restart retains local edits and original uncertain attempt without sending requests',async()=>{
 const f=fixture();f.loseResponse();f.c.change({title:'Remote commit',price:{minor:200}});await f.c.save();f.c.change({title:'New typing',price:{minor:300}});
 const saved=f.c.checkpoint();assert.ok(saved);const restarted=fixture(saved);assert.equal(restarted.calls(),0);assert.equal(restarted.c.snapshot().uncertain,true);restarted.setCurrent(f.getCurrent());await restarted.c.recover();assert.equal(restarted.c.snapshot().baseline?.revision,2);assert.equal(restarted.c.snapshot().draft?.title,'New typing');saved.draft.price.minor=999;assert.equal(restarted.c.snapshot().draft?.price.minor,300);
});
test('checkpoints exclude transient errors and reject foreign identity',()=>{
 const f=fixture();f.c.change({title:'Local',price:{minor:200}});const saved=f.c.checkpoint();assert.ok(saved);assert.equal('failure' in saved,false);
 const attrs=(v:unknown):v is typeof initial.attributes=>!!v&&typeof v==='object'&&'title'in v&&typeof v.title==='string'&&'price'in v&&!!v.price&&typeof v.price==='object'&&'minor'in v.price&&Number.isSafeInteger(v.price.minor);
 const record=(v:unknown):v is typeof initial=>!!v&&typeof v==='object'&&'attributes'in v&&attrs(v.attributes);
 assert.equal(isInventoryEditorCheckpoint(saved,{dealerID:'shop',recordID:'piano'},attrs,record),true);assert.equal(isInventoryEditorCheckpoint(saved,{dealerID:'other',recordID:'piano'},attrs,record),false);
 const foreign={...saved,baseline:{...saved.baseline,id:'other'}};assert.throws(()=>fixture(foreign));f.c.dispose();assert.equal(f.c.checkpoint(),null);
});

test('write-ahead storage must finish before remote edit and retains typing while waiting',async()=>{
 let release!:()=>void;let persisted:InventoryEditorCheckpoint<typeof initial.attributes,typeof initial>|null=null;let calls=0;
 const c=createInventoryEditor({initial,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),classify:()=> 'uncertain' as const,
  persistAttempt:async checkpoint=>{persisted=checkpoint;await new Promise<void>(resolve=>{release=resolve;});},get:async()=>initial,
  edit:async(attributes,revision)=>{calls++;return {...initial,revision:revision+1,attributes};},
 });
 c.change({title:'Attempt',price:{minor:200}});const saving=c.save();assert.equal(calls,0);assert.equal((persisted as InventoryEditorCheckpoint<typeof initial.attributes,typeof initial>|null)?.pending?.attributes.title,'Attempt');c.change({title:'Later typing',price:{minor:300}});release();await saving;assert.equal(calls,1);assert.equal(c.snapshot().draft?.title,'Later typing');
});
test('storage failure prevents remote mutation and releases a new unsent attempt',async()=>{
 let fail=true;let calls=0;
 const c=createInventoryEditor({initial,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),classify:()=> 'uncertain' as const,
  persistAttempt:async()=>{if(fail)throw Error('PRIVATE-STORAGE-DETAIL');},get:async()=>initial,
  edit:async(attributes,revision)=>{calls++;return {...initial,revision:revision+1,attributes};},
 });
 c.change({title:'First',price:{minor:200}});await c.save();assert.equal(calls,0);assert.equal(c.snapshot().uncertain,false);assert.ok(!String(c.snapshot().failure).includes('PRIVATE-STORAGE-DETAIL'));assert.equal(c.checkpoint()?.pending,null);
 c.change({title:'Corrected',price:{minor:300}});fail=false;await c.save();assert.equal(c.snapshot().baseline?.attributes.title,'Corrected');assert.equal(calls,1);
});
test('disposing during write-ahead persistence prevents a later remote request',async()=>{
 let release!:()=>void;let calls=0;
 const c=createInventoryEditor({initial,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b),classify:()=> 'uncertain' as const,
  persistAttempt:async()=>{await new Promise<void>(resolve=>{release=resolve;});},get:async()=>initial,
  edit:async(attributes,revision)=>{calls++;return {...initial,revision:revision+1,attributes};},
 });c.change({title:'Private',price:{minor:200}});const saving=c.save();c.dispose();release();await saving;assert.equal(calls,0);assert.equal(c.snapshot().draft,null);
});

test('scoped journal restores a lost-response attempt after editor restart',async()=>{
 const {createInventoryRecoveryJournal}=await import('./inventory-recovery.js');
 let stored:string|null=null;let remote=structuredClone(initial);let requests=0;
 const attributes=(v:unknown):v is typeof initial.attributes=>!!v&&typeof v==='object'&&'title'in v&&typeof v.title==='string'&&'price'in v&&!!v.price&&typeof v.price==='object'&&'minor'in v.price&&Number.isSafeInteger(v.price.minor);
 const record=(v:unknown):v is typeof initial=>!!v&&typeof v==='object'&&'attributes'in v&&attributes(v.attributes);
 const scope={userID:'user',dealerID:'shop',recordID:'piano'};
 const journal=createInventoryRecoveryJournal({scope,now:()=>1000,validate:(v:unknown):v is InventoryEditorCheckpoint<typeof initial.attributes,typeof initial>=>isInventoryEditorCheckpoint(v,scope,attributes,record),storage:{read:async()=>stored,write:async(_key,value)=>{stored=value;},remove:async()=>{stored=null;}}});
 const port={initial,copy:(a:typeof initial.attributes)=>structuredClone(a),equal:(a:typeof initial.attributes,b:typeof initial.attributes)=>JSON.stringify(a)===JSON.stringify(b),classify:()=> 'uncertain' as const,persistAttempt:journal.save,get:async()=>remote,
 edit:async(a:typeof initial.attributes,revision:number)=>{requests++;const checkpoint=await journal.load();assert.deepEqual(checkpoint?.pending,{attributes:a,revision});remote={...initial,revision:revision+1,attributes:structuredClone(a)};throw Error('response lost');}};
 const first=createInventoryEditor(port);first.change({title:'Persisted intent',price:{minor:200}});await first.save();first.dispose();const recovery=await journal.load();assert.ok(recovery);
 const second=createInventoryEditor({...port,recovery});assert.equal(requests,1);assert.equal(second.snapshot().uncertain,true);await second.recover();assert.equal(second.snapshot().baseline?.revision,2);assert.equal(second.snapshot().uncertain,false);assert.equal(requests,1);
});
