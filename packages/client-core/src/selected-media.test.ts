import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
const sha256=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
import {createSelectedMediaStore} from './selected-media.js';
const scope={userID:'alice',dealerID:'shop',recordID:'@capture'};
function fixture(){
 const rows=new Map<string,string>();let failure=-1;let writes=0;let failRemove:string|undefined;
 const storage={read:async(key:string)=>rows.get(key)??null,write:async(key:string,value:string)=>{if(writes++===failure)throw Error('PRIVATE');rows.set(key,value);},remove:async(key:string)=>{if(key===failRemove)throw Error('PRIVATE');rows.delete(key);}};
 return {rows,storage,store:()=>createSelectedMediaStore({sha256,scope,storage}),failWrite:(n:number)=>{writes=0;failure=n;},failRemove:(key?:string)=>{failRemove=key;}};
}
test('selected media snapshots input and survives reopening across bounded rows',async()=>{
 const f=fixture();const original=Uint8Array.from({length:600000},(_,i)=>i%251);const input=original.slice();
 const saving=f.store().put('selection',input);input.fill(0);await saving;
 assert.deepEqual(await f.store().read('selection'),original);
 assert.ok([...f.rows.values()].every(value=>value.length<1024*1024));
 const result=await f.store().read('selection');result!.fill(0);assert.deepEqual(await f.store().read('selection'),original);
 await f.store().put('selection',original);
 await assert.rejects(f.store().put('selection',new Uint8Array([42])),/^Error: selected_media_unavailable$/);
 assert.deepEqual(await f.store().read('selection'),original);
 for(const field of ['userID','dealerID','recordID'] as const){
  const other=createSelectedMediaStore({sha256,scope:{...scope,[field]:'other'},storage:f.storage});
  assert.equal(await other.read('selection'),null);
 }
 await f.store().remove('selection');assert.equal(f.rows.size,0);
});
test('interrupted chunks are invisible and immutable retry completes the selection',async()=>{
 const f=fixture();const bytes=new Uint8Array(300000).fill(7);f.failWrite(2);
 await assert.rejects(f.store().put('selection',bytes),/^Error: selected_media_unavailable$/);
 assert.equal(await f.store().read('selection'),null);assert.equal(f.rows.size,2);
 f.failWrite(-1);
 await assert.rejects(f.store().put('selection',new Uint8Array(300000).fill(9)));
 await f.store().put('selection',bytes);assert.deepEqual(await f.store().read('selection'),bytes);
});
test('corrupt or missing chunks never yield partial bytes',async()=>{
 for(const corruption of ['missing','hex','length','manifest'] as const){
  const f=fixture();await f.store().put('selection',new Uint8Array(300000).fill(8));
  const chunk=[...f.rows.keys()].find(key=>key.includes('"chunk"'))!;
  const manifest=[...f.rows.keys()].find(key=>key.includes('"manifest"'))!;
  if(corruption==='missing')f.rows.delete(chunk);
  if(corruption==='hex')f.rows.set(chunk,'zz');
  if(corruption==='length')f.rows.set(chunk,'00');
  if(corruption==='manifest')f.rows.set(manifest,'{"version":1,"size":999999999,"chunks":99999}');
  await assert.rejects(f.store().read('selection'),/^Error: selected_media_unavailable$/);
 }
});
test('removal hides selection and cleans other chunks despite a failed deletion',async()=>{
 const f=fixture();await f.store().put('selection',new Uint8Array(600000));
 const first=[...f.rows.keys()].find(key=>key.includes('"chunk"'))!;f.failRemove(first);
 await assert.rejects(f.store().remove('selection'),/^Error: selected_media_unavailable$/);
 assert.equal(await f.store().read('selection'),null);assert.equal(f.rows.size,2);assert.ok(f.rows.has(first));assert.ok([...f.rows.keys()].some(key=>key.includes('"commitment"')));
 f.failRemove();await f.store().remove('selection');assert.equal(f.rows.size,0);
});
test('invalid identity and byte bounds fail before storage',async()=>{
 const f=fixture();const store=f.store();
 await assert.rejects(store.put('selection',new Uint8Array()));
 await assert.rejects(store.put('selection',new Uint8Array(20*1024*1024+1)));
 await assert.rejects(store.put('',new Uint8Array([1])));
 assert.throws(()=>createSelectedMediaStore({sha256,scope:{...scope,userID:''},storage:f.storage}));
 assert.equal(f.rows.size,0);
});
test('interrupted writes cannot change total size even when their first chunk matches',async()=>{
 const f=fixture();const source=new Uint8Array(300000).fill(5);f.failWrite(2);
 await assert.rejects(f.store().put('selection',source));f.failWrite(-1);
 await assert.rejects(f.store().put('selection',source.subarray(0,256*1024)));
 assert.equal(await f.store().read('selection'),null);
 await f.store().put('selection',source);assert.deepEqual(await f.store().read('selection'),source);
});
test('maximum permitted selection fits bounded rows and can be fully removed',async()=>{
 const f=fixture();const bytes=new Uint8Array(20*1024*1024).fill(255);
 await f.store().put('selection',bytes);assert.equal(f.rows.size,82);
 assert.deepEqual(await f.store().read('selection'),bytes);
 await f.store().remove('selection');assert.equal(f.rows.size,0);
});
test('one store serializes put, immutable retry and remove',async()=>{
 const f=fixture();const store=f.store();
 const first=store.put('selection',new Uint8Array([1,2,3]));
 const different=assert.rejects(store.put('selection',new Uint8Array([4,5,6])));
 const read=store.read('selection');const removed=store.remove('selection');
 await first;await different;assert.deepEqual(await read,new Uint8Array([1,2,3]));await removed;assert.equal(f.rows.size,0);
});
test('partial retry cannot replace an unwritten suffix under the same selection identity',async()=>{
 const f=fixture();const original=new Uint8Array(300000).fill(7);f.failWrite(2);
 await assert.rejects(f.store().put('selection',original));f.failWrite(-1);
 const changed=original.slice();changed[299999]=9;
 await assert.rejects(f.store().put('selection',changed),/^Error: selected_media_unavailable$/);
 await f.store().put('selection',original);assert.deepEqual(await f.store().read('selection'),original);
});
test('well-formed modified bytes fail the complete-photo commitment',async()=>{
 const f=fixture();await f.store().put('selection',new Uint8Array([1,2,3]));
 const key=[...f.rows.keys()].find(key=>key.includes('"chunk"'))!;
 const chunk=JSON.parse(f.rows.get(key)!);chunk.data='010204';f.rows.set(key,JSON.stringify(chunk));
 await assert.rejects(f.store().read('selection'),/^Error: selected_media_unavailable$/);
});
test('invalid digest output fails before reserving content',async()=>{
 const f=fixture();const store=createSelectedMediaStore({scope,storage:f.storage,sha256:async()=> 'PRIVATE'});
 await assert.rejects(store.put('selection',new Uint8Array([1])),/^Error: selected_media_unavailable$/);assert.equal(f.rows.size,0);
});
