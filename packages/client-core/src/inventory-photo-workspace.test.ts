import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createInventoryPhotoWorkspace} from './inventory-photo-workspace.js';
function fixture(){
 let active=true;let recordID='piano';let revision=1;let denied=false;let lose=false;let seq=0;let held=false;let uploads=0;let edits=0;let inMedia=false;let ensureCount=0;let cleanupFails=false;
 let photos:{id:string;altText:string}[]=[];const results=new Map<string,string>();const rows=new Map<string,string>();const attempts:{key:string;revision:number;bytes:Uint8Array}[]=[];
 const state=()=>({record:{id:recordID,dealer_id:'d',revision},photos:photos.map(p=>({...p}))});
 const list=async()=>{if(denied)throw 'denied';return state();};
 const port={userID:'u',dealerID:'d',active:()=>active,recordID:()=>recordID,
 ensureRecord:async()=>{ensureCount++;assert.equal(inMedia,false);recordID||='piano';return recordID;},
 withMediaMutation:async<T>(work:()=>Promise<T>)=>{inMedia=true;try{return await work();}finally{inMedia=false;}},
 now:()=>1000,key:()=>`selection-key-${++seq}-00000000`,lease:async()=>{if(held)throw 'held';held=true;return()=>{held=false;};},storage:async()=>({read:async(k:string)=>rows.get(k)??null,write:async(k:string,v:string)=>{rows.set(k,v);},remove:async(k:string)=>{if(cleanupFails)throw 'disk';rows.delete(k);}}),sha256:async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),list,
 upload:async(_id:string,bytes:Uint8Array,key:string,expected:number)=>{assert.equal(inMedia,true);uploads++;attempts.push({key,revision:expected,bytes:bytes.slice()});let id=results.get(key);if(!id){if(expected!==revision)throw 'conflict';id=`photo-${results.size+1}`;results.set(key,id);photos.push({id,altText:''});revision++;}if(lose)throw 'network';return {...state(),photoID:id};},
 reorder:async(_id:string,ids:string[],expected:number)=>{assert.equal(inMedia,true);if(expected!==revision)throw 'conflict';photos=ids.map(id=>photos.find(p=>p.id===id)!);revision++;edits++;return state();},
 describe:async(_id:string,id:string,altText:string,expected:number)=>{assert.equal(inMedia,true);if(expected!==revision)throw 'conflict';photos=photos.map(p=>p.id===id?{id,altText}:p);revision++;edits++;return state();},
 remove:async(_id:string,id:string,expected:number)=>{assert.equal(inMedia,true);if(expected!==revision)throw 'conflict';photos=photos.filter(p=>p.id!==id);revision++;edits++;return state();},
 classify:(e:unknown)=>e==='denied'?'denied' as const:e==='conflict'?'conflict' as const:e==='rejected'?'rejected' as const:'uncertain' as const};
 return {port,rows,attempts,state,cleanupFail:(v:boolean)=>{cleanupFails=v;},held:()=>held,ensureCount:()=>ensureCount,uploads:()=>uploads,edits:()=>edits,inactive:()=>{active=false;},deny:()=>{denied=true;},lose:(v:boolean)=>{lose=v;},textEdit:()=>{revision++;},remotePhotos:()=>{photos.push({id:'remote',altText:'Remote'});revision++;}};
}
test('record selection protects an immutable upload outside the text mutation queue',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);await c.refresh();assert.equal(f.ensureCount(),0);assert.equal(f.held(),true);
 const source=new Uint8Array([1,2,3]);const pending=c.add(source);source.fill(9);await pending;
 assert.equal(f.ensureCount(),1);assert.deepEqual(f.attempts[0]?.bytes,new Uint8Array([1,2,3]));assert.equal(c.snapshot().photos.length,1);assert.equal(c.snapshot().entries.length,0);await c.dispose();assert.equal(f.held(),false);
});
test('uncertain upload survives restart without dispatch and explicit retry keeps exact intent',async()=>{
 const f=fixture();let c=createInventoryPhotoWorkspace(f.port);f.lose(true);await assert.rejects(c.add(new Uint8Array([1])));
 assert.equal(c.snapshot().entries[0]?.state,'attempted');const id=c.snapshot().entries[0]!.id;await assert.rejects(c.discard(id));await c.dispose();
 c=createInventoryPhotoWorkspace(f.port);await c.refresh();assert.equal(f.uploads(),1);f.textEdit();f.lose(false);await c.retry(id);
 assert.equal(f.state().photos.length,1);assert.equal(f.attempts[0]?.key,f.attempts[1]?.key);assert.equal(f.attempts[0]?.revision,f.attempts[1]?.revision);await c.dispose();
});
test('photo edits allow text-only revision change and refuse unseen collection changes',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);await c.add(new Uint8Array([1]));const id=c.snapshot().photos[0]!.id;f.textEdit();await c.describe(id,'Keyboard');assert.equal(f.edits(),1);
 f.remotePhotos();await assert.rejects(c.remove(id));assert.equal(f.edits(),1);assert.equal(c.snapshot().failure,'conflict');assert.equal(c.snapshot().photos.length,2);
 await c.move('remote',-1);assert.equal(c.snapshot().photos[0]?.id,'remote');await c.remove(id);assert.equal(c.snapshot().photos.length,1);await c.dispose();
});
test('denial hides photos and recovery, and inactive scope never dispatches',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);await c.add(new Uint8Array([1]));f.deny();await assert.rejects(c.refresh());assert.equal(c.snapshot().denied,true);assert.deepEqual(c.snapshot().photos,[]);await c.dispose();
 const g=fixture();const d=createInventoryPhotoWorkspace(g.port);g.inactive();await assert.rejects(d.add(new Uint8Array([1])));assert.equal(g.ensureCount(),0);await d.dispose();
});
test('disposal waits for in-flight upload and hides late results before releasing lease',async()=>{
 const f=fixture();let release!:()=>void;let start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});const upload=f.port.upload;
 f.port.upload=async(...args)=>{start();await new Promise<void>(resolve=>{release=resolve;});return upload(...args);};
 const c=createInventoryPhotoWorkspace(f.port);const adding=c.add(new Uint8Array([1]));const rejected=assert.rejects(adding);await started;const closing=c.dispose();assert.equal(f.held(),true);assert.deepEqual(c.snapshot().photos,[]);release();await rejected;await closing;assert.equal(f.held(),false);
});

test('interrupted discard retries local cleanup without claiming or attempting upload',async()=>{
 const f=fixture();f.port.withMediaMutation=async()=>{throw 'conflict';};const c=createInventoryPhotoWorkspace(f.port);
 await assert.rejects(c.add(new Uint8Array([1])));const id=c.snapshot().entries[0]!.id;assert.equal(f.uploads(),0);
 f.cleanupFail(true);await assert.rejects(c.discard(id));assert.equal(c.snapshot().entries[0]?.state,'removing');assert.equal(c.snapshot().entries[0]?.photoID,undefined);
 f.cleanupFail(false);await c.retry(id);assert.deepEqual(c.snapshot().entries,[]);assert.equal(f.uploads(),0);await c.dispose();
});

test('a new photo cannot create a record without a durable capture staging port',async()=>{
 const f=fixture();f.port.recordID=()=>'';const c=createInventoryPhotoWorkspace(f.port);await c.refresh();await assert.rejects(c.add(new Uint8Array([1])));assert.equal(f.ensureCount(),0);await c.dispose();
});

test('durable handoff precedes upload and preserves retry after response loss',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);f.lose(true);let transferred=0;
 await assert.rejects(c.add(new Uint8Array([4,5]),async()=>{
  transferred++;assert.equal(f.uploads(),0);assert.equal(c.snapshot().entries.length,1);assert.ok(f.rows.size>0);
 }));
 assert.equal(transferred,1);const id=c.snapshot().entries[0]!.id;
 f.lose(false);await c.retry(id);assert.equal(f.state().photos.length,1);
 assert.equal(f.attempts[0]?.key,f.attempts[1]?.key);await c.dispose();
});
test('failed handoff acknowledgement retains durable selection without uploading',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);
 await assert.rejects(c.add(new Uint8Array([7]),async()=>{throw new Error('picker cleanup failed');}));
 assert.equal(f.uploads(),0);assert.equal(c.snapshot().entries.length,1);await c.dispose();
});

test('failed durable staging never acknowledges transfer or attempts upload',async()=>{
 const f=fixture();const c=createInventoryPhotoWorkspace(f.port);let transfers=0;
 const storage=await f.port.storage();f.port.storage=async()=>({...storage,write:async()=>{throw new Error('disk');}});
 await assert.rejects(c.add(new Uint8Array([8]),async()=>{transfers++;}));
 assert.equal(transfers,0);assert.equal(f.uploads(),0);await c.dispose();
});
