import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryRecoveryJournal } from './inventory-recovery.js';
const scope={userID:'user',dealerID:'dealer',recordID:'record'};
const payload={title:'Private draft',attempt:{revision:2}};
const validate=(value:unknown):value is typeof payload=>!!value&&typeof value==='object'&&'title'in value&&typeof value.title==='string'&&'attempt'in value&&!!value.attempt&&typeof value.attempt==='object'&&'revision'in value.attempt&&Number.isSafeInteger(value.attempt.revision);
function fixture(){const data=new Map<string,string>();let now=1000;let fail=false;const journal=createInventoryRecoveryJournal({scope,now:()=>now,validate,storage:{read:async key=>data.get(key)??null,write:async(key,value)=>{if(fail)throw Error('write failed');data.set(key,value);},remove:async key=>{data.delete(key);}}});return {journal,data,setNow:(value:number)=>{now=value;},fail:()=>{fail=true;}};}
test('scoped journal persists copies and rejects foreign envelopes',async()=>{
 const f=fixture();await f.journal.save(payload);assert.deepEqual(await f.journal.load(),payload);const restored=await f.journal.load();restored!.attempt.revision=9;assert.deepEqual(await f.journal.load(),payload);
 const key=[...f.data.keys()][0]!;const envelope=JSON.parse(f.data.get(key)!);envelope.scope.userID='other';f.data.set(key,JSON.stringify(envelope));assert.equal(await f.journal.load(),null);assert.equal(f.data.size,0);
});
test('expiry, malformed data and invalid shapes never restore private state',async()=>{
 const f=fixture();await f.journal.save(payload);f.setNow(1000+7*24*60*60*1000);assert.equal(await f.journal.load(),null);assert.equal(f.data.size,0);
 f.setNow(2000);await f.journal.save(payload);const key=[...f.data.keys()][0]!;f.data.set(key,'malformed');assert.equal(await f.journal.load(),null);
 await assert.rejects(f.journal.save({title:42} as unknown as typeof payload));assert.equal(f.data.size,0);
});
test('discard waits for earlier writes and prevents resurrection',async()=>{
 let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});let stored:string|null=null;
 const j=createInventoryRecoveryJournal({scope,now:()=>1000,validate,storage:{read:async()=>stored,write:async(_key,value)=>{started();await new Promise<void>(resolve=>{release=resolve;});stored=value;},remove:async()=>{stored=null;}}});
 const saving=j.save(payload);await ready;const discarding=j.discard();release();await saving;await discarding;assert.equal(stored,null);await assert.rejects(j.save(payload));assert.equal(await j.load(),null);
});
test('failed writes remain failures and cannot poison subsequent removal',async()=>{const f=fixture();f.fail();await assert.rejects(f.journal.save(payload));await f.journal.discard();assert.equal(f.data.size,0);});

test('UTF-8 size bound rejects oversized recovery and save snapshots caller data',async()=>{
 const f=fixture();await assert.rejects(f.journal.save({...payload,title:'🎹'.repeat(300000)}));assert.equal(f.data.size,0);
 const changing=structuredClone(payload);const saving=f.journal.save(changing);changing.title='Changed after submission';changing.attempt.revision=99;await saving;assert.deepEqual(await f.journal.load(),payload);
});
test('discard suppresses a late storage read and removal failure remains retryable',async()=>{
 const f=fixture();await f.journal.save(payload);const serialized=[...f.data.values()][0]!;let release!:(value:string|null)=>void;let readStarted!:()=>void;const ready=new Promise<void>(resolve=>{readStarted=resolve;});let removalFails=true;let removed=false;
 const j=createInventoryRecoveryJournal({scope,now:()=>1000,validate,storage:{read:async()=>{readStarted();return new Promise<string|null>(resolve=>{release=resolve;});},write:async()=>{},remove:async()=>{if(removalFails)throw Error('remove failed');removed=true;}}});
 const loading=j.load();await ready;const discard=j.discard();release(serialized);assert.equal(await loading,null);await assert.rejects(discard);assert.equal(removed,false);removalFails=false;await j.discard();assert.equal(removed,true);
});
