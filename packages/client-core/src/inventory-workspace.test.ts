import assert from 'node:assert/strict';
import test from 'node:test';
import {createInventoryWorkspace} from './inventory-workspace.js';
import {createInventoryRecoveryJournal} from './inventory-recovery.js';
import type {InventoryEditorCheckpoint} from './inventory-editor.js';
const initial={id:'piano',dealer_id:'shop',revision:1,attributes:{title:'Original'}};
type Checkpoint=InventoryEditorCheckpoint<typeof initial.attributes,typeof initial>;
function fixture(recovery?:Checkpoint){
 let remote=structuredClone(initial);let stored:string|null=null;let diskFails=false;let networkFails=false;let denied=false;let calls=0;let scheduled:(()=>void)|null=null;
 const journal=createInventoryRecoveryJournal<Checkpoint>({scope:{userID:'u',dealerID:'shop',recordID:'piano'},now:()=>1000,validate:(v):v is Checkpoint=>!!v,storage:{read:async()=>stored,write:async(_,v)=>{if(diskFails)throw Error('private');stored=v;},remove:async()=>{stored=null;}}});
 const c=createInventoryWorkspace({initial,recovery,journal,copy:(v:typeof initial.attributes)=>({...v}),equal:(a,b)=>a.title===b.title,valid:a=>a.title!=='',schedule:(fn)=>{scheduled=fn;return()=>{scheduled=null;};},classify:e=>e==='denied'?'denied':e==='conflict'?'conflict':'uncertain',get:async()=>{if(denied)throw 'denied';return remote;},edit:async(attributes,revision)=>{calls++;if(denied)throw 'denied';if(networkFails)throw 'outage';if(revision!==remote.revision)throw 'conflict';remote={...remote,attributes,revision:revision+1};return remote;}});
 return {c,journal,tick:async()=>{const run=scheduled;scheduled=null;run?.();await settle();},calls:()=>calls,stored:()=>stored,disk:(v:boolean)=>{diskFails=v;},network:(v:boolean)=>{networkFails=v;},deny:()=>{denied=true;},remote:(r:typeof initial)=>{remote=r;}};
}
async function settle(){for(let i=0;i<30;i++)await Promise.resolve();}
test('edits become durable before debounced save; incomplete input is recovered without a remote write',async()=>{
 const f=fixture();await settle();f.c.change({title:''});await f.c.flush();assert.equal((await f.journal.load())?.draft.title,'');await f.tick();assert.equal(f.calls(),0);f.c.change({title:'Edited'});await f.c.flush();assert.equal(f.calls(),0);await f.tick();assert.equal(f.calls(),1);assert.equal(f.c.snapshot().dirty,false);assert.equal(f.c.snapshot().recovery,'ready');
});
test('disk failure prevents autosave and navigation; explicit retry makes the current draft durable',async()=>{
 const f=fixture();await settle();f.disk(true);f.c.change({title:'Private'});assert.equal(await f.c.flush(),false);assert.equal(f.c.snapshot().recovery,'failed');await f.tick();assert.equal(f.calls(),0);f.disk(false);await f.c.save();assert.equal(f.calls(),1);assert.equal(await f.c.flush(),true);
});
test('restart pauses mutations and uncertain failures never loop automatically',async()=>{
 const f=fixture({version:1,baseline:initial,draft:{title:'Recovered'},pending:null,conflict:false});await settle();await f.tick();assert.equal(f.calls(),0);assert.equal(f.c.snapshot().restored,true);f.network(true);await f.c.save();await f.tick();assert.equal(f.calls(),1);assert.equal(f.c.snapshot().uncertain,true);f.network(false);await f.c.recover();assert.equal(f.c.snapshot().uncertain,true);await f.c.save();assert.equal(f.calls(),2);
});
test('denial discards recovery and dispose cancels queued autosave',async()=>{
 const f=fixture();await settle();f.c.change({title:'Secret'});await f.c.flush();f.deny();await f.c.save();await settle();assert.equal(f.c.snapshot().draft,null);assert.equal(f.stored(),null);
 const g=fixture();await settle();g.c.change({title:'Later'});await g.c.flush();g.c.dispose();await g.tick();assert.equal(g.calls(),0);assert.equal(g.c.snapshot().draft,null);
});
test('conflicts require fresh review before either choice and retain local input',async()=>{
 const f=fixture();await settle();f.c.change({title:'Mine'});f.remote({...initial,revision:2,attributes:{title:'Theirs'}});await f.c.save();assert.equal(f.c.snapshot().conflict,true);await f.tick();assert.equal(f.calls(),1);await f.c.recover();assert.equal(f.c.snapshot().latest?.attributes.title,'Theirs');f.c.keepEdits();await f.c.flush();await f.tick();assert.equal(f.c.snapshot().baseline?.attributes.title,'Mine');
});
