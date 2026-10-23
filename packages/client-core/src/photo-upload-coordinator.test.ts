import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {openPhotoUploadCoordinator} from './photo-upload-coordinator.js';
function fixture(){
 const rows=new Map<string,string>();const events:string[]=[];let denied=false;let active=true;let held=false;let next=0;let lose=false;let conflict=false;let uploadCount=0;let failWrite=false;let failCleanup=false;let revision=1;
 const attempts:{recordID:string;revision:number;key:string;bytes:Uint8Array}[]=[];
 const results=new Map<string,string>();
 const storage={read:async(k:string)=>{events.push('read');return rows.get(k)??null;},write:async(k:string,v:string)=>{events.push('write');if(failWrite)throw Error('PRIVATE');rows.set(k,v);},remove:async(k:string)=>{if(failCleanup)throw Error('PRIVATE');rows.delete(k);}};
 const port={scope:{userID:'u',dealerID:'d',recordID:'@capture'},active:()=>active,now:()=>1000,key:()=>`selection-key-0000-${++next}`,
 authorize:async()=>{events.push('authorize');if(denied)throw 'denied';},lease:async()=>{if(held)throw Error('held');held=true;return()=>{held=false;};},storage:async()=>storage,
 sha256:async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),
 target:async(recordID?:string)=>({recordID:recordID??'piano',revision}),
 upload:async(intent:{recordID:string;revision:number;key:string;bytes:Uint8Array})=>{uploadCount++;attempts.push({...intent,bytes:intent.bytes.slice()});if(conflict)throw 'conflict';const photoID=results.get(intent.key)??`photo-${results.size+1}`;results.set(intent.key,photoID);if(lose)throw 'network';return {recordID:intent.recordID,photoID};},
 classify:(e:unknown)=>e==='denied'?'denied' as const:e==='conflict'?'conflict' as const:e==='rejected'?'rejected' as const:'uncertain' as const};
 return {port,rows,events,attempts,results,held:()=>held,count:()=>uploadCount,deny:()=>{denied=true;},inactive:()=>{active=false;},lose:(v:boolean)=>{lose=v;},conflict:(v:boolean)=>{conflict=v;},revision:(v:number)=>{revision=v;},failWrite:(v:boolean)=>{failWrite=v;},failCleanup:(v:boolean)=>{failCleanup=v;}};
}
test('selection protects media before upload and acknowledged cleanup removes local data',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);assert.equal(f.events[0],'authorize');
 const source=new Uint8Array([1,2,3]);const selecting=c.select(source);source.fill(9);const id=await selecting;
 assert.equal(c.snapshot().entries[0]?.state,'ready');assert.equal(f.count(),0);
 const result=await c.upload(id);assert.deepEqual(result,{recordID:'piano',photoID:'photo-1'});assert.deepEqual(f.attempts[0]?.bytes,new Uint8Array([1,2,3]));
 assert.deepEqual(c.snapshot().entries,[]);assert.equal(f.rows.size,1);await c.dispose();assert.equal(f.held(),false);
});
test('lost upload acknowledgement survives restart with exact intent and no automatic dispatch',async()=>{
 const f=fixture();let c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));f.lose(true);
 await assert.rejects(c.upload(id));assert.equal(c.snapshot().entries[0]?.state,'attempted');await c.dispose();
 f.revision(99);c=await openPhotoUploadCoordinator(f.port);assert.equal(f.count(),1);f.lose(false);await c.upload(id);
 assert.equal(f.results.size,1);assert.equal(f.attempts[0]?.key,f.attempts[1]?.key);assert.equal(f.attempts[1]?.revision,1);await c.dispose();
});
test('acknowledged cleanup retries without a second remote upload',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));f.failCleanup(true);
 await assert.rejects(c.upload(id));assert.equal(c.snapshot().entries[0]?.state,'removing');assert.equal(f.count(),1);
 f.failCleanup(false);await c.upload(id);assert.equal(f.count(),1);assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
});
test('conflict needs explicit rebase and a new key, with no automatic retry',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));f.conflict(true);
 await assert.rejects(c.upload(id));assert.equal(c.snapshot().entries[0]?.state,'conflict');await assert.rejects(c.upload(id));assert.equal(f.count(),1);
 await c.rebase(id);assert.equal(f.count(),1);f.conflict(false);f.revision(2);await c.upload(id);
 assert.notEqual(f.attempts[0]?.key,f.attempts[1]?.key);assert.equal(f.attempts[1]?.revision,2);await c.dispose();
});
test('denial precedes recovery reads and failed persistence prevents upload',async()=>{
 const denied=fixture();denied.deny();await assert.rejects(openPhotoUploadCoordinator(denied.port));assert.deepEqual(denied.events,['authorize']);assert.equal(denied.held(),false);
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));f.failWrite(true);
 await assert.rejects(c.upload(id));assert.equal(f.count(),0);f.failWrite(false);f.deny();await assert.rejects(c.upload(id));assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
});
test('disposal while dispatch is in flight retains lease until drain and suppresses late result',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 const upload=f.port.upload;f.port.upload=async intent=>{started();await new Promise<void>(resolve=>{release=resolve;});return upload(intent);};
 const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));const pending=c.upload(id);const rejection=assert.rejects(pending);
 await ready;const disposal=c.dispose();assert.equal(f.held(),true);assert.deepEqual(c.snapshot().entries,[]);release();await rejection;await disposal;assert.equal(f.held(),false);
 f.port.upload=upload;const reopened=await openPhotoUploadCoordinator(f.port);assert.equal(reopened.snapshot().entries[0]?.state,'attempted');await reopened.upload(id);assert.equal(f.results.size,1);await reopened.dispose();
});
test('corrupt reopened ledger hides prior cached entries instead of reusing stale recovery',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);await c.select(new Uint8Array([1]));
 const key=[...f.rows.keys()].find(k=>k.includes('inventory-photo-uploads'))!;f.rows.set(key,'PRIVATE');
 await assert.rejects(c.refresh());assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
});
test('permission loss at final authorization suppresses dispatch and hides recovered entries',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));
 let calls=0;f.port.authorize=async()=>{if(++calls===2)throw 'denied';};
 await assert.rejects(c.upload(id));assert.equal(f.count(),0);assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
});
test('activity loss during the attempted checkpoint prevents dispatch',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));
 const storage=await f.port.storage();const write=storage.write;
 storage.write=async(k,v)=>{await write(k,v);if(k.includes('inventory-photo-uploads')&&v.includes('"attempted"'))f.inactive();};
 await assert.rejects(c.upload(id));assert.equal(f.count(),0);assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
});
for(const after of [false,true]){
 test(`acknowledgement checkpoint failure ${after?'after':'before'} commit preserves safe retry`,async()=>{
  const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));
  const storage=await f.port.storage();const write=storage.write;let fail=true;
  storage.write=async(k,v)=>{if(fail&&v.includes('"acknowledged"')){if(after)await write(k,v);throw Error('PRIVATE');}await write(k,v);};
  await assert.rejects(c.upload(id));assert.equal(f.results.size,1);fail=false;
  await c.upload(id);assert.equal(f.results.size,1);assert.equal(f.count(),after?1:2);assert.deepEqual(c.snapshot().entries,[]);await c.dispose();
 });
}
test('incomplete selection retains its reservation and resumes only with the committed source',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const storage=await f.port.storage();const write=storage.write;
 storage.write=async(k,v)=>{if(k.includes('"chunk"'))throw Error('PRIVATE');await write(k,v);};
 await assert.rejects(c.select(new Uint8Array([1,2])));const id=c.snapshot().entries[0]!.id;assert.equal(c.snapshot().entries[0]?.state,'reserved');
 storage.write=write;await assert.rejects(c.resume(id,new Uint8Array([1,3])));await c.resume(id,new Uint8Array([1,2]));
 assert.equal(c.snapshot().entries[0]?.state,'ready');await c.upload(id);await c.dispose();
});
test('transient authorization failure hides recovery without classifying the session as denied',async()=>{
 const f=fixture();const c=await openPhotoUploadCoordinator(f.port);await c.select(new Uint8Array([1]));
 f.port.authorize=async()=>{throw 'network';};await assert.rejects(c.refresh());
 assert.deepEqual(c.snapshot().entries,[]);assert.equal(c.snapshot().denied,false);await c.dispose();
});
for(const outcome of ['wrong-record','missing-photo','network','rejected'] as const){
 test(`upload ${outcome} preserves the appropriate durable outcome`,async()=>{
  const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));
  f.port.upload=async()=>{if(outcome==='network'||outcome==='rejected')throw outcome;return {recordID:outcome==='wrong-record'?'other':'piano',photoID:outcome==='missing-photo'?'':'photo'};};
  await assert.rejects(c.upload(id));assert.equal(c.snapshot().entries[0]?.state,outcome==='rejected'?'rejected':'attempted');
  if(outcome!=='rejected'){await assert.rejects(c.remove(id));assert.equal(c.snapshot().entries.length,1);}
  else {await c.remove(id);assert.deepEqual(c.snapshot().entries,[]);}
  await c.dispose();
 });
}
for(const reason of ['denied','network'] as const){
 test(`target resolution ${reason} is classified without dispatch or lost intent`,async()=>{
  const f=fixture();const c=await openPhotoUploadCoordinator(f.port);const id=await c.select(new Uint8Array([1]));
  f.port.target=async()=>{throw reason;};await assert.rejects(c.upload(id));assert.equal(f.count(),0);
  assert.equal(c.snapshot().denied,reason==='denied');
  if(reason==='denied')assert.deepEqual(c.snapshot().entries,[]);
  else assert.equal(c.snapshot().entries[0]?.state,'ready');
  await c.dispose();
 });
}
