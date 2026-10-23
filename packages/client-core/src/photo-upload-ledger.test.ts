import assert from 'node:assert/strict';
import test from 'node:test';
import {openPhotoUploadLedger} from './photo-upload-ledger.js';
const scope={userID:'alice',dealerID:'shop',recordID:'@capture'};
function fixture(){
 const rows=new Map<string,string>();let mode:'ok'|'before'|'after'='ok';let time=1000;
 const storage={read:async(k:string)=>rows.get(k)??null,write:async(k:string,v:string)=>{if(mode==='before')throw Error('PRIVATE');rows.set(k,v);if(mode==='after')throw Error('PRIVATE');},remove:async(k:string)=>{rows.delete(k);}};
 return {rows,storage,open:()=>openPhotoUploadLedger({scope,storage,now:()=>time}),mode:(m:typeof mode)=>{mode=m;},time:(n:number)=>{time=n;}};
}
test('reservation, exact attempted intent and acknowledgement survive restart before cleanup',async()=>{
 const f=fixture();let ledger=await f.open();
 await ledger.reserve('selection',12,'stable-upload-key-01');
 assert.deepEqual(ledger.snapshot()[0],{id:'selection',size:12,key:'stable-upload-key-01',createdAt:1000,state:'reserved'});
 await ledger.ready('selection');await ledger.attempt('selection','piano',4);
 ledger=await f.open();assert.equal(ledger.snapshot()[0]?.state,'attempted');
 await ledger.attempt('selection','piano',4);
 await assert.rejects(ledger.attempt('selection','piano',5));
 await assert.rejects(ledger.remove('selection'));
 await ledger.acknowledge('selection','photo');ledger=await f.open();
 assert.equal(ledger.snapshot()[0]?.photoID,'photo');
 await ledger.remove('selection');await ledger.forget('selection');assert.deepEqual((await f.open()).snapshot(),[]);
});
test('conflict requires explicit new key before rebasing; rejected content cannot retry',async()=>{
 const f=fixture();const ledger=await f.open();
 await ledger.reserve('a',1,'stable-upload-key-01');await ledger.ready('a');await ledger.attempt('a','piano',1);
 await ledger.conflict('a');await assert.rejects(ledger.attempt('a','piano',2));
 await assert.rejects(ledger.rebase('a','stable-upload-key-01'));
 await ledger.rebase('a','replacement-key-02');await ledger.attempt('a','piano',2);
 await ledger.reject('a');await assert.rejects(ledger.ready('a'));await ledger.remove('a');await ledger.forget('a');
});
for(const mode of ['before','after'] as const){
 test(`uncertain ${mode}-write failure requires reopen without permitting dispatch`,async()=>{
  const f=fixture();const ledger=await f.open();await ledger.reserve('a',1,'stable-upload-key-01');await ledger.ready('a');f.mode(mode);
  await assert.rejects(ledger.attempt('a','piano',1),/^Error: photo_upload_storage_unavailable$/);
  assert.throws(()=>ledger.snapshot(),/^Error: photo_upload_storage_unavailable$/);
  await assert.rejects(ledger.acknowledge('a','photo'));
  f.mode('ok');const reopened=await f.open();assert.equal(reopened.snapshot()[0]?.state,mode==='after'?'attempted':'ready');
 });
}
test('capacity, identities and transitions are bounded without erasing reservations',async()=>{
 const f=fixture();const ledger=await f.open();
 for(let i=0;i<5;i++)await ledger.reserve(String(i),20*1024*1024,`stable-upload-key-${i}`);
 await assert.rejects(ledger.reserve('overflow',1,'stable-upload-key-99'));
 await assert.rejects(ledger.reserve('0',1,'stable-upload-key-01'));
 await assert.rejects(ledger.forget('0'));await assert.rejects(ledger.acknowledge('0','photo'));
 assert.equal(ledger.snapshot().length,5);
 const view=ledger.snapshot();view[0]!.key='changed';assert.notEqual(ledger.snapshot()[0]?.key,'changed');
});
test('wrong scope and malformed persisted state fail closed without deleting bytes',async()=>{
 const f=fixture();const ledger=await f.open();await ledger.reserve('a',1,'stable-upload-key-01');
 const [key,raw]=[...f.rows][0]!;const bad=JSON.parse(raw);bad.scope.dealerID='other';f.rows.set(key,JSON.stringify(bad));
 await assert.rejects(f.open(),/^Error: photo_upload_storage_unavailable$/);assert.equal(f.rows.size,1);
 f.rows.set(key,'PRIVATE');await assert.rejects(f.open(),/^Error: photo_upload_storage_unavailable$/);assert.equal(f.rows.size,1);
});
test('rebase changes revision and retry key but cannot redirect the selected photo',async()=>{
 const f=fixture();const ledger=await f.open();await ledger.reserve('a',1,'stable-upload-key-01');await ledger.ready('a');
 await ledger.attempt('a','piano',1);await ledger.conflict('a');await ledger.rebase('a','replacement-key-02');
 await assert.rejects(ledger.attempt('a','different-piano',2));
 await ledger.attempt('a','piano',2);assert.equal((await f.open()).snapshot()[0]?.recordID,'piano');
});
test('queued reservations retain all identities and enforce the selection count limit',async()=>{
 const f=fixture();const ledger=await f.open();
 await Promise.all(Array.from({length:50},(_,i)=>ledger.reserve(String(i),1,`stable-upload-key-${i}`)));
 assert.equal(ledger.snapshot().length,50);await assert.rejects(ledger.reserve('extra',1,'stable-upload-key-99'));
 assert.equal((await f.open()).snapshot().length,50);
});
test('record-bound ledger rejects attempts aimed at another record',async()=>{
 const f=fixture();const ledger=await openPhotoUploadLedger({scope:{...scope,recordID:'piano'},storage:f.storage,now:()=>1000});
 await ledger.reserve('a',1,'stable-upload-key-01');await ledger.ready('a');
 await assert.rejects(ledger.attempt('a','other',1));await assert.rejects(ledger.attempt('a','piano',9007199254740992));
 assert.equal(ledger.snapshot()[0]?.state,'ready');await ledger.attempt('a','piano',1);
});
test('expiry is fixed to reservation time and distinguishes uncertain uploads',async()=>{
 const f=fixture();const ledger=await f.open();await ledger.reserve('a',1,'stable-upload-key-01');
 await ledger.ready('a');await ledger.attempt('a','piano',1);
 f.time(1000+7*24*60*60*1000-1);await assert.rejects(ledger.expire('a'));
 f.time(1000+7*24*60*60*1000);await ledger.expire('a');
 assert.equal(ledger.snapshot()[0]?.state,'removing');assert.equal(ledger.snapshot()[0]?.expired,'uncertain');
 assert.equal((await f.open()).snapshot()[0]?.expired,'uncertain');
 await ledger.expire('a');assert.equal(ledger.snapshot()[0]?.expired,'uncertain');
 await ledger.forget('a');assert.deepEqual(ledger.snapshot(),[]);
});
test('capture import is atomic, timestamp preserving and idempotent after consumption',async()=>{
 const f=fixture();const recordScope={...scope,recordID:'piano'};const open=()=>openPhotoUploadLedger({scope:recordScope,storage:f.storage,now:()=>2000});let ledger=await open();
 const imported={id:'selected',size:3,key:'capture-upload-key-01',createdAt:1000,sourceScope:'capture-origin'};
 await ledger.importReady(imported);assert.deepEqual(ledger.snapshot()[0],{...imported,state:'ready'});await ledger.remove('selected');await ledger.forget('selected');
 ledger=await open();assert.equal(ledger.hasImport(imported),true);await ledger.importReady(imported);assert.deepEqual(ledger.snapshot(),[]);
 await assert.rejects(ledger.importReady({...imported,key:'different-upload-key'}));assert.throws(()=>ledger.hasImport({...imported,size:4}));
});
test('import provenance survives a changed retry key after a conflict',async()=>{
 const f=fixture();const recordScope={...scope,recordID:'piano'};const open=()=>openPhotoUploadLedger({scope:recordScope,storage:f.storage,now:()=>2000});let ledger=await open();
 const imported={id:'selected',size:3,key:'capture-upload-key-01',createdAt:1000,sourceScope:'capture-origin'};
 await ledger.importReady(imported);await ledger.attempt('selected','piano',1);await ledger.conflict('selected');await ledger.rebase('selected','replacement-upload-key');
 ledger=await open();assert.equal(ledger.hasImport(imported),true);assert.equal(ledger.snapshot()[0]?.key,'replacement-upload-key');await ledger.attempt('selected','piano',2);await ledger.acknowledge('selected','photo');
});
