import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryFormFromAttributes} from './inventory-form';
import {createInventoryVoiceWorkspace,type InventoryVoiceWorkspacePort} from './inventory-voice-workspace';
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
function fixture(){
 let draft=inventoryFormFromAttributes({stock_number:'PT-1'},'.'),active=true,held=false,denied=false,extracts=0;
 const baseline={id:'piano',dealer_id:'shop',revision:1,attributes:draft};
 const port:InventoryVoiceWorkspacePort={accountID:'account',dealerID:'shop',active:()=>active,
  snapshot:()=>({baseline,draft,denied}),change:form=>{draft={...form};},
  withMutation:async work=>{held=true;try{await work(baseline);}finally{held=false;}},
  transcribe:async()=>({revision:1,transcript:'Grand piano'}),
  extract:async()=>{extracts++;return {revision:1,transcript:'Grand piano',candidates:[{field:'title',value:{text:'Grand piano'},confidence:'high',evidence:'Grand piano'}]};},classify:()=> 'unavailable',
 };
 return {port,get draft(){return draft;},get held(){return held;},get extracts(){return extracts;},deactivate:()=>{active=false;},deny:()=>{denied=true;}};
}
async function reviewed(w:ReturnType<typeof createInventoryVoiceWorkspace>){
 if(w.snapshot().voice?.phase==='review')return;
 await new Promise<void>(resolve=>{let off=()=>{};off=w.subscribe(s=>{if(s.voice?.phase==='review'){off();resolve();}});});
}
test('voice queue protects manual edits through explicit review and releases on Apply; Undo survives release',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkspace(f.port);const run=w.extractTranscript('Grand piano');await reviewed(w);
 assert.equal(f.held,true);assert.equal(w.snapshot().paused,true);assert.equal(f.draft.title,'');
 f.port.change({...f.draft,private_notes:'Manual'});w.apply(['title']);await run;
 assert.equal(f.held,false);assert.equal(w.snapshot().busy,false);assert.equal(f.draft.title,'Grand piano');
 w.undo();assert.equal(f.draft.title,'');assert.equal(f.draft.private_notes,'Manual');
});
test('preparation is busy but not paused; cancellation cannot overlap a pending acquisition',async()=>{
 const f=fixture(),gate=deferred<string|null>();let calls=0;f.port.ensureRecord=()=>{calls++;return gate.promise;};const w=createInventoryVoiceWorkspace(f.port);
 const bytes=new Uint8Array([1]);const run=w.process(bytes,'audio/mp4');assert.equal(w.snapshot().busy,true);assert.equal(w.snapshot().paused,false);
 w.cancel();await w.extractTranscript('Grand piano');assert.equal(calls,1);gate.resolve('piano');await run;
 assert.equal(f.extracts,0);assert.deepEqual([...bytes],[0]);assert.equal(w.snapshot().busy,false);
});
test('cancellation during provider work aborts and suppresses late review while queue settles',async()=>{
 const f=fixture(),gate=deferred<unknown>();let signal!:AbortSignal;f.port.extract=async(_id,_r,_t,s)=>{signal=s;return gate.promise;};const w=createInventoryVoiceWorkspace(f.port);
 const run=w.extractTranscript('Grand piano');assert.equal(w.snapshot().paused,true);w.cancel();assert.equal(signal.aborted,true);
 assert.equal(w.snapshot().busy,true);gate.resolve({});await run;assert.equal(w.snapshot().voice,null);assert.equal(f.held,false);
});
test('cancel releases review and scope invalidation clears private data',async()=>{
 for(const action of ['cancel','scope','denied','dispose'] as const){
  const f=fixture(),w=createInventoryVoiceWorkspace(f.port);const run=w.extractTranscript('Grand piano');await reviewed(w);
  if(action==='cancel')w.cancel();if(action==='scope'){f.deactivate();w.reconcile();}if(action==='denied'){f.deny();w.reconcile();}if(action==='dispose')w.dispose();
  await run;assert.equal(f.held,false);assert.equal(w.snapshot().voice,null);assert.equal(f.draft.title,'');
 }
});
test('provider denial clears review and exposes only fixed denial',async()=>{
 const f=fixture();f.port.extract=async()=>{throw Error('PRIVATE');};f.port.classify=()=> 'denied';const w=createInventoryVoiceWorkspace(f.port);
 await w.extractTranscript('Grand piano');assert.equal(w.snapshot().issue,'denied');assert.equal(w.snapshot().voice,null);assert.equal(f.held,false);assert.ok(!JSON.stringify(w.snapshot()).includes('PRIVATE'));
});
test('audio is cleared before review waits and preparation failure releases the queue',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkspace(f.port),audio=new Uint8Array([1,2]);const run=w.process(audio,'audio/mp4');await reviewed(w);
 // The workflow emits review before its processing promise settles.
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual([...audio],[0,0]);w.cancel();await run;
 const g=fixture();g.port.ensureRecord=async()=>null;const x=createInventoryVoiceWorkspace(g.port);await x.extractTranscript('Grand piano');assert.equal(x.snapshot().issue,'unavailable');assert.equal(g.held,false);
});

test('review coordinator forwards accepted origins and keeps Undo manual across queue release',async()=>{
 const f=fixture();const origins:(readonly string[]|undefined)[]=[];const change=f.port.change;
 f.port.change=(form,fields)=>{origins.push(fields);change(form,fields);};
 const w=createInventoryVoiceWorkspace(f.port);const run=w.extractTranscript('Grand piano');await reviewed(w);
 w.apply(['title']);await run;w.undo();assert.deepEqual(origins,[['title'],undefined]);w.dispose();
});
