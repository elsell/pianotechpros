import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryFormFromAttributes} from './inventory-form.js';
import {createInventoryVoiceWorkflow} from './inventory-voice-workflow.js';
const scope={accountID:'account',dealerID:'shop',recordID:'piano'};
const proposal={revision:1,transcript:'Grand piano',candidates:[{field:'title',value:{text:'Grand piano'},confidence:'high',evidence:'Grand piano'}]};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function fixture(){
 let current:any={...scope,revision:1,form:inventoryFormFromAttributes({stock_number:'PT-1'},'.')};let extracts=0,transcribes=0;let audio:number[]=[];
 const port={scope,current:()=>current,change:(form:any)=>{current.form={...form};return true;},classify:()=> 'unavailable' as const,transcribe:async(_revision:number,bytes:Uint8Array,_mime:string,_signal:AbortSignal)=>{transcribes++;audio=[...bytes];return {revision:1,transcript:'Grand piano'};},extract:async(_revision:number,_text:string,_signal:AbortSignal)=>{extracts++;return structuredClone(proposal);}};
 return {port,get current(){return current;},set current(value){current=value;},get extracts(){return extracts;},get transcribes(){return transcribes;},get audio(){return audio;}};
}
test('voice workflow reviews explicitly and applies/undoes through the form port',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);const bytes=new Uint8Array([1,2,3]);const processing=w.process(bytes,'audio/wav');bytes.fill(9);await processing;
 assert.deepEqual(f.audio,[1,2,3]);assert.equal(w.snapshot().phase,'review');assert.equal(f.current.form.title,'');assert.equal(f.extracts,1);
 const exposed=w.snapshot();exposed.proposal!.candidates[0]!.value.text='Tampered';w.apply(['title']);assert.equal(f.current.form.title,'Grand piano');assert.equal(w.snapshot().phase,'applied');
 f.current.form.private_notes='Keep';w.undo();assert.equal(f.current.form.title,'');assert.equal(f.current.form.private_notes,'Keep');assert.equal(w.snapshot().canUndo,false);
});
test('manual edits require renewed review and later corrections survive undo',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');f.current.form.title='Manual';w.apply(['title']);assert.deepEqual(w.snapshot().conflicts,['title']);assert.equal(f.current.form.title,'Manual');
 w.refreshReview();w.apply(['title']);assert.equal(f.current.form.title,'Grand piano');f.current.form.title='Later';w.undo();assert.equal(f.current.form.title,'Later');assert.deepEqual(w.snapshot().conflicts,['title']);
});
for(const cause of ['cancel','dispose','scope','revision'] as const){test(`voice ignores completion after ${cause}`,async()=>{
 const f=fixture(),pending=deferred<{revision:number;transcript:string}>();let signal!:AbortSignal;f.port.transcribe=async(_r,_b,_m,s)=>{signal=s;return pending.promise;};const w=createInventoryVoiceWorkflow(f.port);const job=w.process(new Uint8Array([1]),'audio/wav');
 if(cause==='cancel')w.cancel();if(cause==='dispose')w.dispose();if(cause==='scope')f.current={...f.current,accountID:'other'};if(cause==='revision')f.current.revision=2;
 pending.resolve({revision:1,transcript:'Grand piano'});await job;assert.equal(f.extracts,0);assert.equal(w.snapshot().proposal,null);assert.equal(w.snapshot().phase,cause==='revision'?'failed':'idle');if(cause==='cancel'||cause==='dispose')assert.equal(signal.aborted,true);
});}
test('a failed extraction retains only transcript for explicit retry',async()=>{
 const f=fixture();let fail=true;const extract=f.port.extract;f.port.extract=async(...args)=>{if(fail)throw Error('PRIVATE PROVIDER DATA');return extract(...args);};const w=createInventoryVoiceWorkflow(f.port);await w.process(new Uint8Array([1]),'audio/wav');
 assert.equal(w.snapshot().phase,'failed');assert.equal(w.snapshot().transcript,'Grand piano');assert.equal(w.snapshot().issue,'unavailable');assert.ok(!JSON.stringify(w.snapshot()).includes('PRIVATE'));
 fail=false;await w.extractTranscript(w.snapshot().transcript);assert.equal(w.snapshot().phase,'review');
});
test('observer cancellation and overlapping attempts cannot dispatch extra work',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);w.subscribe(state=>{if(state.phase==='transcribing')w.cancel();});await w.process(new Uint8Array([1]),'audio/wav');assert.equal(f.transcribes,0);
 const f2=fixture(),pending=deferred<{revision:number;transcript:string}>();f2.port.transcribe=async()=>pending.promise;const w2=createInventoryVoiceWorkflow(f2.port);const first=w2.process(new Uint8Array([1]),'audio/wav');await w2.process(new Uint8Array([2]),'audio/wav');pending.resolve({revision:1,transcript:'Grand piano'});await first;assert.equal(f2.extracts,1);
});

test('local change rejection cannot claim application or lose a retryable undo',async()=>{
 const f=fixture(),change=f.port.change;let accept=false;f.port.change=(form)=>{if(!accept)return false;change(form);return true;};const w=createInventoryVoiceWorkflow(f.port);
 await w.extractTranscript('Grand piano');w.apply(['title']);assert.equal(w.snapshot().phase,'review');assert.equal(w.snapshot().canUndo,false);assert.equal(f.current.form.title,'');
 accept=true;w.apply(['title']);assert.equal(w.snapshot().canUndo,true);accept=false;w.undo();assert.equal(w.snapshot().canUndo,true);assert.equal(f.current.form.title,'Grand piano');
 accept=true;w.undo();assert.equal(w.snapshot().canUndo,false);assert.equal(f.current.form.title,'');
});

test('cancel clears private state but holds the pipeline until the aborted provider settles',async()=>{
 const f=fixture(),pending=deferred<{revision:number;transcript:string}>();let calls=0;f.port.transcribe=async()=>{calls++;return pending.promise;};const w=createInventoryVoiceWorkflow(f.port);
 const first=w.process(new Uint8Array([1]),'audio/wav');w.cancel();assert.equal(w.snapshot().transcript,'');assert.equal(w.snapshot().proposal,null);
 const second=w.process(new Uint8Array([2]),'audio/wav');await w.extractTranscript('Grand piano');assert.equal(calls,1);assert.equal(f.extracts,0);await second;
 pending.resolve({revision:1,transcript:'Grand piano'});await first;await w.process(new Uint8Array([3]),'audio/wav');assert.equal(calls,2);assert.equal(f.extracts,1);
});
