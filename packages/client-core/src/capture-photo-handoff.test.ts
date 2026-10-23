import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {openInventoryCapture} from './inventory-capture.js';
import {handoffCapturePhoto,discardCapturePhoto} from './capture-photo-handoff.js';
import {openPhotoUploadLedger} from './photo-upload-ledger.js';
import {openPhotoUploadCoordinator} from './photo-upload-coordinator.js';
import type {InventoryWireAttributes} from './inventory-form.js';
const sha256=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const rows=new Map<string,string>();const keys:string[]=[];let seq=0;let now=1000;let loseCreate=false;let failImport=false;let held=false;let photoHeld=false;let cleanupFails=false;let record:{id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes}|null=null;
 const scope={userID:'u',dealerID:'d',recordID:'piano'};
 const storage={read:async(k:string)=>rows.get(k)??null,write:async(k:string,v:string)=>{rows.set(k,v);if(failImport&&k.includes('inventory-photo-uploads'))throw Error('lost-import-ack');},remove:async(k:string)=>{if(cleanupFails&&k.includes('inventory-selected-media'))throw Error('cleanup');rows.delete(k);}};
 const lease=async()=>{if(photoHeld)throw Error('held');photoHeld=true;return()=>{photoHeld=false;};};
 const handoff=(id:string,selection:Parameters<typeof handoffCapturePhoto>[0]['selection'])=>handoffCapturePhoto({...scope,recordID:id,selection,active:()=>true,authorize:async()=>{assert.equal(record?.id,id);},lease,storage:async()=>storage,sha256,now:()=>now});
 const port={...scope,decimal:'.' as const,active:()=>true,now:()=>now,key:()=>`capture-key-${++seq}-00000000`,authorize:async()=>{},lease:async()=>{if(held)throw Error('held');held=true;return()=>{held=false;};},storage:async()=>storage,media:{sha256,handoff,discard:(id:string,selection:Parameters<typeof handoffCapturePhoto>[0]['selection'])=>discardCapturePhoto({...scope,recordID:id,selection,active:()=>true,authorize:async()=>{},lease,storage:async()=>storage,sha256,now:()=>now})},
 create:async(key:string)=>{keys.push(key);record??={id:'piano',dealer_id:'d',revision:1,attributes:{stock_number:'PT-1'}};if(loseCreate)throw Error('lost-create-ack');return structuredClone(record);},get:async()=>structuredClone(record!),edit:async(_id:string,attributes:InventoryWireAttributes,revision:number)=>{record={...record!,attributes,revision:revision+1};return structuredClone(record);},classify:()=> 'uncertain' as const,schedule:()=>()=>{},onCreated:()=>{}};
 const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
 return {port,rows,keys,scope,storage,lease,cleanupFail:(v:boolean)=>{cleanupFails=v;},held:()=>held,photoHeld:()=>photoHeld,now:(v:number)=>{now=v;},loseCreate:(v:boolean)=>{loseCreate=v;},failImport:(v:boolean)=>{failImport=v;},settle,ledger:()=>openPhotoUploadLedger({scope,storage,now:()=>now})};
}
test('selected media survives lost creation response and transfers to the same record on restart',async()=>{
 const f=fixture();let c=await openInventoryCapture(f.port);assert.ok(c);const source=new Uint8Array([1,2,3]);const staged=c.stagePhoto(source);source.fill(9);const selection=await staged;assert.ok(selection);assert.equal(f.keys.length,0);
 const meta=c.pendingPhoto()!;f.loseCreate(true);assert.equal(await c.ensureRecord(),null);assert.equal(c.pendingPhoto()?.id,selection);c.dispose();await f.settle();
 c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(f.keys.length,1);assert.equal(c.pendingPhoto()?.id,selection);f.loseCreate(false);f.now(2000);assert.equal(await c.ensureRecord(),'piano');
 assert.equal(new Set(f.keys).size,1);assert.equal(c.pendingPhoto(),null);const ledger=await f.ledger();assert.deepEqual(ledger.snapshot()[0],{...meta,state:'ready'});
 let uploaded:Uint8Array|undefined;const upload=await openPhotoUploadCoordinator({scope:f.scope,active:()=>true,now:()=>2000,key:()=> 'unused-upload-key-01',authorize:async()=>{},lease:f.lease,storage:async()=>f.storage,sha256,target:async()=>({recordID:'piano',revision:1}),upload:async intent=>{uploaded=intent.bytes;return {recordID:'piano',photoID:'photo'};},classify:()=> 'uncertain'});
 await upload.upload(selection);assert.deepEqual(uploaded,new Uint8Array([1,2,3]));assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),false);await upload.dispose();c.dispose();
});
test('lost import acknowledgement retains capture pointer and receipt prevents reimport after consumption',async()=>{
 const f=fixture();let c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));const meta=c.pendingPhoto()!;f.failImport(true);assert.equal(await c.ensureRecord(),null);assert.equal(c.recordID(),'piano');assert.equal(c.pendingPhoto()?.id,meta.id);assert.equal(f.held(),true);f.failImport(false);
 // The atomic destination reservation can be consumed by its record independently.
 const upload=await openPhotoUploadCoordinator({scope:f.scope,active:()=>true,now:()=>1000,key:()=> 'unused-upload-key-01',authorize:async()=>{},lease:f.lease,storage:async()=>f.storage,sha256,target:async()=>({recordID:'piano',revision:1}),upload:async()=>({recordID:'piano',photoID:'photo'}),classify:()=> 'uncertain'});
 await upload.upload(meta.id);await upload.dispose();assert.deepEqual((await f.ledger()).snapshot(),[]);c.dispose();await f.settle();
 c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(c.recordID(),'piano');assert.equal(c.pendingPhoto(),null);assert.equal(f.keys.length,1);assert.deepEqual((await f.ledger()).snapshot(),[]);assert.equal(f.held(),false);c.dispose();
});
test('capture staging serializes with creation and suppresses source replacement',async()=>{
 const f=fixture();const hash=f.port.media.sha256;let release!:()=>void;let start!:()=>void;const ready=new Promise<void>(resolve=>{start=resolve;});f.port.media.sha256=async bytes=>{start();await new Promise<void>(resolve=>{release=resolve;});return hash(bytes);};
 const c=await openInventoryCapture(f.port);assert.ok(c);const staging=c.stagePhoto(new Uint8Array([1]));await ready;const saving=c.ensureRecord();assert.equal(f.keys.length,0);await assert.rejects(c.stagePhoto(new Uint8Array([2])));f.port.media.sha256=hash;release();await staging;assert.equal(await saving,'piano');c.dispose();
});
test('handoff authorization failure precedes storage and never publishes a reservation',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));let reads=0;
 await assert.rejects(handoffCapturePhoto({...f.scope,selection:c.pendingPhoto()!,active:()=>true,authorize:async()=>{throw Error('denied');},lease:f.lease,storage:async()=>{reads++;return f.storage;},sha256,now:()=>1000}));assert.equal(reads,0);assert.equal(f.photoHeld(),false);await c.discardPhoto();assert.equal(c.pendingPhoto(),null);c.dispose();
});

test('expired pre-record media is removed before its journal and cleanup failure retains its pointer',async()=>{
 const f=fixture();let c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));c.dispose();await f.settle();f.now(1000+7*24*60*60*1000);f.cleanupFail(true);
 await assert.rejects(openInventoryCapture(f.port));assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-recovery')&&k.includes('@capture')),true);
 f.cleanupFail(false);c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(c.pendingPhoto(),null);assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),false);assert.equal(f.keys.length,0);c.dispose();
});
test('fresh text checkpoints do not extend selected photo retention',async()=>{
 const f=fixture();let c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));f.now(1000+6*24*60*60*1000);c.change({...c.snapshot().draft!,title:'Still editing'});await c.flush();c.dispose();await f.settle();f.now(1000+7*24*60*60*1000);
 c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(c.snapshot().draft?.title,'Still editing');assert.equal(c.pendingPhoto(),null);assert.equal(c.expiredPhoto(),true);assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),false);c.dispose();
});
test('expired capture pointer never deletes media already owned by an imported record',async()=>{
 const f=fixture();let c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));f.failImport(true);await c.ensureRecord();f.failImport(false);c.dispose();await f.settle();f.now(1000+7*24*60*60*1000);
 c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(c.pendingPhoto(),null);assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),true);
 const uploads=await openPhotoUploadCoordinator({scope:f.scope,active:()=>true,now:()=>1000+7*24*60*60*1000,key:()=> 'unused-upload-key-01',authorize:async()=>{},lease:f.lease,storage:async()=>f.storage,sha256,target:async()=>({recordID:'piano',revision:1}),upload:async()=>{throw Error('must not dispatch');},classify:()=> 'uncertain'});
 assert.equal(uploads.snapshot().expiredSelections,1);assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),false);await uploads.dispose();c.dispose();
});
test('denied creation removes staged media before its pointer and retains the pointer if cleanup fails',async()=>{
 for(const fail of [false,true]){
  const f=fixture();const port={...f.port,create:async()=>{throw Error('denied');},classify:()=> 'denied' as const};const c=await openInventoryCapture(port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));f.cleanupFail(fail);assert.equal(await c.ensureRecord(),null);assert.equal(c.snapshot().draft,null);assert.equal(c.pendingPhoto(),null);
  assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),fail);assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-recovery')&&k.includes('@capture')),fail);c.dispose();
 }
});

test('explicit discard completes failed post-create handoff without orphaning or uploading the photo',async()=>{
 const f=fixture();f.port.media.handoff=async()=>{throw Error('handoff-interrupted');};const c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));assert.equal(await c.ensureRecord(),null);assert.equal(c.recordID(),'piano');
 await c.discardPhoto();assert.equal(c.pendingPhoto(),null);assert.equal(c.snapshot().recovery,'ready');assert.equal([...f.rows.keys()].some(k=>k.includes('inventory-selected-media')),false);assert.deepEqual((await f.ledger()).snapshot(),[]);assert.equal(f.held(),false);c.dispose();
});
test('discarding a photo-only selection leaves New lazy',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);await c.stagePhoto(new Uint8Array([1]));await c.discardPhoto();assert.equal(c.snapshot().dirty,false);assert.equal(f.keys.length,0);c.dispose();
});
