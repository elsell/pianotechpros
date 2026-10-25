import test from 'node:test';
import assert from 'node:assert/strict';
import {createTechnicianRecoveryJournal} from './technician-recovery.js';
import {emptyTechnicianForm} from './technician-form.js';
import type {TechnicianEditorCheckpoint} from './technician-editor.js';
const checkpoint=():TechnicianEditorCheckpoint=>({version:1,baseline:null,draft:{...emptyTechnicianForm(),name:'PRIVATE'},pending:null,conflict:false});
const scope={userID:'user',apiBaseURL:'https://api.example.test'};
function fixture(){const values=new Map<string,string>();return {values,storage:{async read(k:string){return values.get(k)??null;},async write(k:string,v:string){values.set(k,v);},async remove(k:string){values.delete(k);}}};}
test('technician journal reopens with account/API isolation and defensive snapshots',async()=>{
 const f=fixture();const port={scope,storage:f.storage,zones:new Set(['UTC']),now:()=>1000};
 const journal=createTechnicianRecoveryJournal(port);const cp=checkpoint();const saving=journal.save(cp);cp.draft.name='Changed';await saving;
 assert.equal((await createTechnicianRecoveryJournal(port).load()).checkpoint!.draft.name,'PRIVATE');
 for(const foreign of [{...scope,userID:'other'},{...scope,apiBaseURL:'https://other.example.test'}])assert.equal((await createTechnicianRecoveryJournal({...port,scope:foreign}).load()).checkpoint,null);
 const key=[...f.values.keys()][0]!;const raw=f.values.get(key)!;const tampered=JSON.parse(raw);tampered.scope.userID='other';f.values.set(key,JSON.stringify(tampered));assert.equal((await journal.load()).discarded,'invalid');assert.equal(f.values.size,0);
});
test('technician journal expires and bounds corrupted envelopes without exposing raw failures',async()=>{
 const f=fixture();let now=1000;const port={scope,storage:f.storage,zones:new Set(['UTC']),now:()=>now};const j=createTechnicianRecoveryJournal(port);await j.save(checkpoint());now+=7*24*60*60*1000;
 assert.deepEqual(await j.load(),{checkpoint:null,discarded:'expired'});assert.equal(f.values.size,0);
 now=1000;await j.save(checkpoint());const key=[...f.values.keys()][0]!;f.values.set(key,'PRIVATE');assert.equal((await j.load()).discarded,'invalid');
 const bad={...checkpoint(),draft:{...emptyTechnicianForm(),name:'x'.repeat(10001)}};await assert.rejects(j.save(bad),e=>e instanceof Error&&!e.message.includes('PRIVATE'));assert.equal(f.values.size,0);
 const broken=createTechnicianRecoveryJournal({...port,storage:{...f.storage,read:async()=>{throw Error('PRIVATE');}}});await assert.rejects(broken.load(),e=>e instanceof Error&&e.message==='technician_recovery_unavailable');
});
test('technician discard follows active writes and prevents queued resurrection',async()=>{
 const f=fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const j=createTechnicianRecoveryJournal({scope,zones:new Set(['UTC']),now:()=>1000,storage:{...f.storage,write:async(k,v)=>{await gate;await f.storage.write(k,v);}}});
 const saving=j.save(checkpoint());await new Promise(r=>setImmediate(r));const next=j.save(checkpoint());const discarded=j.discard();release();await Promise.allSettled([saving,next]);await discarded;assert.equal(f.values.size,0);await assert.rejects(j.save(checkpoint()));
});

test('technician journal applies UTF-8 size bounds and hides a read completed after scope loss',async()=>{
 const f=fixture();let active=true;const port={scope,storage:f.storage,zones:new Set(['UTC']),now:()=>1000,active:()=>active};const j=createTechnicianRecoveryJournal(port);
 await j.save(checkpoint());const rawKey=[...f.values.keys()][0]!;f.values.set(rawKey,'😀'.repeat(2*1024*1024));assert.deepEqual(await j.load(),{checkpoint:null,discarded:'invalid'});assert.equal(f.values.size,0);
 await j.save(checkpoint());const read=f.storage.read;f.storage.read=async key=>{const value=await read(key);active=false;return value;};assert.deepEqual(await j.load(),{checkpoint:null,discarded:null});
 active=true;f.storage.read=read;const alias=createTechnicianRecoveryJournal({...port,scope:{...scope,apiBaseURL:scope.apiBaseURL+'/'}});assert.equal((await alias.load()).checkpoint!.draft.name,'PRIVATE');
 for(const bad of [{...scope,apiBaseURL:'https://user:secret@example.test'},{...scope,userID:''},{...scope,apiBaseURL:'https://api.example.test?token=PRIVATE'}])assert.throws(()=>createTechnicianRecoveryJournal({...port,scope:bad}),e=>e instanceof Error&&e.message==='technician_recovery_unavailable');
});
