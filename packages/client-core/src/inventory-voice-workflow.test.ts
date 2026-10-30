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

test('Apply attributes only actual changes and Undo uses manual input',async()=>{
 const f=fixture();const fields:(readonly string[]|undefined)[]=[];
 const w=createInventoryVoiceWorkflow({...f.port,change:(form,voiceFields)=>{fields.push(voiceFields);return f.port.change(form);}});
 await w.extractTranscript('Grand piano');w.apply(['title']);w.undo();
 assert.deepEqual(fields,[['title'],undefined]);
 f.current.form.title='Grand piano';await w.extractTranscript('Grand piano');w.apply(['title']);
 assert.deepEqual(fields[2],[]);assert.equal(w.snapshot().canUndo,false);
});

test('focused clarification replaces only its candidate and still requires Apply and supports Undo',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');
 f.port.extract=async(_revision,transcript)=>({revision:1,transcript,candidates:[{field:'title',value:{text:'Concert grand'},confidence:'high',evidence:'Concert grand'},{field:'make',value:{text:'Other'},confidence:'high',evidence:'Grand'}]} as any);
 await w.clarify('title','Concert grand');
 assert.equal(f.current.form.title,'');assert.deepEqual(w.snapshot().proposal?.candidates.map(c=>c.field),['title']);
 assert.equal(w.snapshot().proposal?.candidates[0]?.value.text,'Concert grand');
 w.apply(['title']);assert.equal(f.current.form.title,'Concert grand');w.undo();assert.equal(f.current.form.title,'');
});
test('clarification failure preserves prior review and manual edit conflicts',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');
 f.port.extract=async()=>{throw Error('private provider response');};await w.clarify('title','Concert grand');
 assert.equal(w.snapshot().phase,'review');assert.equal(w.snapshot().issue,'unavailable');assert.equal(w.snapshot().proposal?.candidates[0]?.value.text,'Grand piano');
 f.current.form.title='Manual';w.apply(['title']);assert.deepEqual(w.snapshot().conflicts,['title']);
});
for(const cause of ['cancel','dispose','scope','revision','malformed'] as const)test(`clarification suppresses ${cause} completion`,async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');const pending=deferred<any>();let calls=0,signal!:AbortSignal;
 f.port.extract=async(_r,_t,s)=>{calls++;signal=s;return pending.promise;};
 const job=w.clarify('title','Concert grand');w.apply(['title']);w.refreshReview();assert.equal(f.current.form.title,'');
 if(cause==='cancel')w.cancel();if(cause==='dispose')w.dispose();if(cause==='scope')f.current.accountID='other';if(cause==='revision')f.current.revision=2;
 await w.clarify('title','Again');await w.extractTranscript('Grand piano');assert.equal(calls,1);
 pending.resolve(proposal);await job;assert.equal(f.current.form.title,'');
 if(['cancel','dispose','scope'].includes(cause)){assert.equal(w.snapshot().proposal,null);assert.equal(signal.aborted,true);}else{assert.equal(w.snapshot().proposal?.candidates[0]?.value.text,'Grand piano');assert.equal(w.snapshot().issue,cause==='revision'?'conflict':'protocol_error');}
});

test('clarification retains unrelated candidates and cannot erase them with provider output',async()=>{
 const f=fixture();f.port.extract=async()=>({...structuredClone(proposal),candidates:[...proposal.candidates,{field:'make',value:{text:'Grand'},confidence:'uncertain',evidence:'Grand'}]} as any);
 const w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');
 f.port.extract=async(_r,transcript)=>({revision:1,transcript,candidates:[{field:'title',value:{text:'Concert grand'},confidence:'high',evidence:'Concert grand'},{field:'make',value:{text:'Concert'},confidence:'high',evidence:'Concert'}]} as any);
 await w.clarify('title','Concert grand');assert.deepEqual(w.snapshot().proposal?.candidates[1],{field:'make',value:{text:'Grand'},confidence:'uncertain',evidence:'Grand'});
});
test('invalid clarification answers and fields never call the provider',async()=>{
 const f=fixture(),w=createInventoryVoiceWorkflow(f.port);await w.extractTranscript('Grand piano');
 for(const [field,answer] of [['title',''],['title','x'.repeat(16000)],['make','Different']] as const){await w.clarify(field,answer);assert.equal(f.extracts,1);assert.equal(w.snapshot().issue,'invalid_input');assert.equal(w.snapshot().phase,'review');}
});
test('clarification denial clears private review and observer cancellation prevents dispatch',async()=>{
 const g=fixture();const x=createInventoryVoiceWorkflow({...g.port,classify:()=> 'denied',extract:(...args)=>g.port.extract(...args)});await x.extractTranscript('Grand piano');g.port.extract=async()=>{throw Error('private');};
 await x.clarify('title','Concert grand');assert.equal(x.snapshot().proposal,null);assert.equal(x.snapshot().transcript,'');
 const h=fixture(),y=createInventoryVoiceWorkflow(h.port);await y.extractTranscript('Grand piano');y.subscribe(state=>{if(state.phase==='review'&&state.busy)y.cancel();});await y.clarify('title','Concert grand');assert.equal(h.extracts,1);assert.equal(y.snapshot().proposal,null);
});
