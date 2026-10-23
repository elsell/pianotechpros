import assert from 'node:assert/strict';
import test from 'node:test';
import {openInventoryCapture} from './inventory-capture.js';
import type {InventoryWireAttributes} from './inventory-form.js';
function fixture(){
 const data=new Map<string,string>();let locked=false;let authorization=true;let diskFails=false;let recordDiskFails=false;let removalFails=false;let captureBlock:(()=>Promise<void>)|null=null;let recordBlock:(()=>Promise<void>)|null=null;let removalBlock:(()=>Promise<void>)|null=null;let lose=false;let creates=0;let updates=0;let timer:(()=>void)|null=null;let block:(()=>Promise<void>)|null=null;let record:{id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes}|null=null;
 const keys:string[]=[];
 const storage={read:async(k:string)=>data.get(k)??null,write:async(k:string,v:string)=>{if(diskFails||recordDiskFails&&!k.includes('@capture'))throw Error('disk');if(captureBlock&&k.includes('@capture'))await captureBlock();if(recordBlock&&!k.includes('@capture'))await recordBlock();data.set(k,v);},remove:async(k:string)=>{if(diskFails||removalFails)throw Error('disk');if(removalBlock)await removalBlock();data.delete(k);}};
 const port={userID:'user',dealerID:'shop',decimal:',' as const,active:()=>true,now:()=>1000,key:()=> '01234567-89ab-4cde-8fab-0123456789ab',authorize:async()=>{if(!authorization)throw 'denied';},lease:async()=>{if(locked)throw Error('inventory_capture_busy');locked=true;return()=>{locked=false;};},storage:async()=>storage,
 create:async(key:string)=>{creates++;keys.push(key);if(!authorization)throw 'denied';if(block)await block();record??={id:'piano',dealer_id:'shop',revision:1,attributes:{stock_number:'PT-1'}};if(lose)throw 'network';return structuredClone(record);},
 get:async()=>{if(!authorization)throw 'denied';return structuredClone(record!);},edit:async(_id:string,attributes:InventoryWireAttributes,revision:number)=>{updates++;if(revision!==record!.revision)throw 'conflict';record={...record!,attributes,revision:revision+1};return structuredClone(record);},classify:(e:unknown)=>e==='denied'?'denied' as const:e==='conflict'?'conflict' as const:'uncertain' as const,schedule:(fn:()=>void)=>{timer=fn;return()=>{timer=null;};},onCreated:(_id:string)=>{}};
 return {port,data,keys,counts:()=>({creates,updates}),record:()=>record,locked:()=>locked,disk:(v:boolean)=>{diskFails=v;},recordDisk:(v:boolean)=>{recordDiskFails=v;},removal:(v:boolean)=>{removalFails=v;},holdCapture:(v:(()=>Promise<void>)|null)=>{captureBlock=v;},holdRecord:(v:(()=>Promise<void>)|null)=>{recordBlock=v;},holdRemoval:(v:()=>Promise<void>)=>{removalBlock=v;},deny:()=>{authorization=false;},lose:(v:boolean)=>{lose=v;},block:(v:()=>Promise<void>)=>{block=v;},tick:async()=>{const run=timer;timer=null;run?.();for(let i=0;i<100;i++)await Promise.resolve();}};
}
test('New is lazy; first change persists intent and one record receives all details',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);assert.equal(f.counts().creates,0);assert.equal(f.data.size,0);assert.equal(c.snapshot().dirty,false);
 c.change({...c.snapshot().draft!,make:'Yamaha',asking_amount:'12,50'});assert.equal(await c.flush(),true);await c.save();assert.equal(f.counts().creates,1);assert.equal(f.record()?.attributes.make,'Yamaha');assert.equal(f.record()?.attributes.stock_number,'PT-1');assert.equal(f.record()?.attributes.asking_price?.minor_units,1250);assert.equal(f.locked(),false);assert.equal([...f.data.keys()].some(k=>k.includes('@capture')),false);c.dispose();
});
test('lost creation acknowledgement survives restart with the same key and no automatic retry',async()=>{
 const f=fixture();f.lose(true);const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'Local draft'});await c.save();assert.equal(c.snapshot().uncertain,true);c.dispose();await Promise.resolve();
 const next=await openInventoryCapture(f.port);assert.ok(next);assert.equal(next.snapshot().draft?.title,'Local draft');await f.tick();assert.equal(f.counts().creates,1);f.lose(false);await next.save();assert.equal(f.counts().creates,2);assert.equal(new Set(f.keys).size,1);assert.equal(f.record()?.attributes.title,'Local draft');next.dispose();
});
test('storage failure prevents create and explicit retry preserves input',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);f.disk(true);c.change({...c.snapshot().draft!,title:'Protected'});assert.equal(await c.flush(),false);await c.save();assert.equal(f.counts().creates,0);f.disk(false);await c.save();assert.equal(f.record()?.attributes.title,'Protected');c.dispose();
});
test('typing during creation reaches the record journal without being replaced',async()=>{
 const f=fixture();let release!:()=>void;f.block(()=>new Promise<void>(resolve=>{release=resolve;}));const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'First'});const saving=c.save();for(let i=0;i<30&&!release;i++)await Promise.resolve();assert.ok(release);c.change({...c.snapshot().draft!,title:'Later typing',asking_amount:'12,'});release();await saving;assert.equal(c.snapshot().draft?.title,'Later typing');assert.equal(c.snapshot().draft?.asking_amount,'12,');assert.equal(c.snapshot().invalid,true);assert.equal(f.counts().updates,0);assert.equal(await c.flush(),true);c.dispose();
});
test('exclusive lease and fresh authorization prevent overwriting or disclosing another capture',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'Private'});await c.flush();await assert.rejects(openInventoryCapture(f.port),/inventory_capture_busy/);f.deny();await assert.rejects(openInventoryCapture(f.port));assert.equal(c.snapshot().draft?.title,'Private');c.dispose();
});

test('failed record-journal handoff retries without a second creation',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);f.recordDisk(true);c.change({...c.snapshot().draft!,title:'Handoff'});await c.save();assert.equal(c.snapshot().recovery,'failed');assert.equal(f.counts().creates,1);assert.equal(f.counts().updates,0);f.recordDisk(false);await c.save();assert.equal(f.counts().creates,1);assert.equal(f.record()?.attributes.title,'Handoff');assert.equal(c.snapshot().recovery,'ready');c.dispose();
});
test('restart after cleanup failure prefers the newer record journal over the capture payload',async()=>{
 const f=fixture();f.removal(true);const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'At creation'});await c.save();assert.equal(c.snapshot().recovery,'failed');c.change({...c.snapshot().draft!,title:'After handoff failure'});for(let i=0;i<40;i++)await Promise.resolve();c.dispose();for(let i=0;i<40&&f.locked();i++)await Promise.resolve();f.removal(false);
 const next=await openInventoryCapture(f.port);assert.ok(next);assert.equal(next.snapshot().draft?.title,'After handoff failure');assert.equal(f.counts().creates,1);await next.save();assert.equal(f.record()?.attributes.title,'After handoff failure');next.dispose();
});
test('native lease coordinator isolates dealer scopes and stale releases cannot unlock a new owner',async()=>{
 const {createInventoryCaptureLease}=await import('./inventory-capture.js');const acquire=createInventoryCaptureLease();const release=await acquire('u','a');const other=await acquire('u','b');await assert.rejects(acquire('u','a'),/inventory_capture_busy/);release();const next=await acquire('u','a');release();await assert.rejects(acquire('u','a'),/inventory_capture_busy/);next();other();
});

test('disposal retains capture ownership until delayed attached-editor persistence finishes',async()=>{
 const f=fixture();f.removal(true);const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'Before handoff'});await c.save();let release!:()=>void;f.holdRecord(()=>new Promise<void>(resolve=>{release=resolve;}));c.change({...c.snapshot().draft!,title:'Newest local input'});for(let i=0;i<30&&!release;i++)await Promise.resolve();assert.ok(release);c.dispose();for(let i=0;i<30;i++)await Promise.resolve();assert.equal(f.locked(),true);await assert.rejects(openInventoryCapture(f.port),/inventory_capture_busy/);f.holdRecord(null);release();for(let i=0;i<30;i++)await Promise.resolve();f.removal(false);const next=await openInventoryCapture(f.port);assert.ok(next);assert.equal(next.snapshot().draft?.title,'Newest local input');next.dispose();
});
test('pending capture removal is reported as protecting input, not a failed write',async()=>{
 const f=fixture();let release!:()=>void;f.holdRemoval(()=>new Promise<void>(resolve=>{release=resolve;}));const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,title:'Handoff'});const saving=c.save();for(let i=0;i<100&&!release;i++)await Promise.resolve();assert.ok(release);assert.equal(c.snapshot().recovery,'writing');release();await saving;c.dispose();
});

test('permission loss on create clears private capture and removes its journal',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);c.change({...c.snapshot().draft!,private_notes:'Private'});await c.flush();f.deny();await c.save();assert.equal(c.snapshot().denied,true);assert.equal(c.snapshot().draft,null);assert.equal(f.record(),null);assert.equal(f.data.size,0);assert.equal(f.locked(),false);c.dispose();
});
test('disposal while the creation intent is writing suppresses dispatch and retains ownership until durable',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);let release!:()=>void;f.holdCapture(()=>new Promise<void>(resolve=>{release=resolve;}));c.change({...c.snapshot().draft!,title:'Interrupted typing'});for(let i=0;i<30&&!release;i++)await Promise.resolve();assert.ok(release);c.dispose();for(let i=0;i<30;i++)await Promise.resolve();assert.equal(f.locked(),true);assert.equal(f.counts().creates,0);f.holdCapture(null);release();for(let i=0;i<30&&f.locked();i++)await Promise.resolve();const next=await openInventoryCapture(f.port);assert.ok(next);assert.equal(next.snapshot().draft?.title,'Interrupted typing');assert.equal(f.counts().creates,0);next.dispose();
});
