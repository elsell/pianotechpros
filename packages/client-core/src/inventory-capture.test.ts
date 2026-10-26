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

test('photo intent ensures one durable record without a synthetic text edit',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);
 assert.equal(f.counts().creates,0);assert.equal(f.data.size,0);
 const ids=await Promise.all([c.ensureRecord(),c.ensureRecord()]);
 assert.deepEqual(ids,['piano','piano']);assert.equal(f.counts().creates,1);
 assert.equal(f.counts().updates,0);assert.equal(c.recordID(),'piano');
 assert.equal(c.snapshot().draft?.stock_number,'PT-1');assert.equal(c.snapshot().recovery,'ready');
 assert.equal([...f.data.keys()].some(k=>k.includes('@capture')),false);
 assert.equal(await c.ensureRecord(),'piano');assert.equal(f.counts().creates,1);c.dispose();
 assert.equal(await c.ensureRecord(),null);
});
test('photo-triggered create protects its key before dispatch and withholds failed handoffs',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);
 f.disk(true);assert.equal(await c.ensureRecord(),null);assert.equal(f.counts().creates,0);
 f.disk(false);f.recordDisk(true);assert.equal(await c.ensureRecord(),null);assert.equal(f.counts().creates,1);
 f.recordDisk(false);assert.equal(await c.ensureRecord(),'piano');assert.equal(f.counts().creates,1);c.dispose();
});
test('uncertain photo-triggered creation resumes the same intent after restart',async()=>{
 const f=fixture();f.lose(true);const c=await openInventoryCapture(f.port);assert.ok(c);
 assert.equal(await c.ensureRecord(),null);assert.equal(c.snapshot().uncertain,true);c.dispose();
 for(let i=0;i<40&&f.locked();i++)await Promise.resolve();
 const next=await openInventoryCapture(f.port);assert.ok(next);await f.tick();assert.equal(f.counts().creates,1);
 f.lose(false);assert.equal(await next.ensureRecord(),'piano');assert.equal(new Set(f.keys).size,1);next.dispose();
});
test('photo-triggered creation preserves invalid partial text and fails closed on denial',async()=>{
 const f=fixture();const c=await openInventoryCapture(f.port);assert.ok(c);
 c.change({...c.snapshot().draft!,asking_amount:'12,'});
 assert.equal(await c.ensureRecord(),'piano');assert.equal(c.snapshot().draft?.asking_amount,'12,');assert.equal(f.counts().updates,0);c.dispose();
 const denied=fixture();const other=await openInventoryCapture(denied.port);assert.ok(other);denied.deny();
 assert.equal(await other.ensureRecord(),null);assert.equal(other.snapshot().denied,true);assert.equal(denied.data.size,0);other.dispose();
});
test('ensureRecord waits for durable handoff and disposal suppresses its result',async()=>{
 const f=fixture();let release!:()=>void;f.holdRemoval(()=>new Promise<void>(resolve=>{release=resolve;}));
 const c=await openInventoryCapture(f.port);assert.ok(c);let settled=false;
 const ensuring=c.ensureRecord().then(id=>{settled=true;return id;});
 for(let i=0;i<100&&!release;i++)await Promise.resolve();
 assert.ok(release);assert.equal(settled,false);assert.equal(c.snapshot().recovery,'writing');
 c.dispose();release();assert.equal(await ensuring,null);
});
test('inactive capture cannot ensure a record or expose an existing one',async()=>{
 const f=fixture();let active=true;f.port.active=()=>active;
 const c=await openInventoryCapture(f.port);assert.ok(c);active=false;
 assert.equal(await c.ensureRecord(),null);assert.equal(f.counts().creates,0);
 active=true;assert.equal(await c.ensureRecord(),'piano');active=false;
 assert.equal(await c.ensureRecord(),null);c.dispose();
});
test('scope loss during durable intent write suppresses creation without discarding recovery',async()=>{
 const f=fixture();let active=true;f.port.active=()=>active;
 const c=await openInventoryCapture(f.port);assert.ok(c);let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});f.holdCapture(()=>gate);
 const ensuring=c.ensureRecord();for(let i=0;i<30;i++)await Promise.resolve();
 active=false;f.holdCapture(null);release();
 assert.equal(await ensuring,null);assert.equal(f.counts().creates,0);assert.equal(f.data.size,1);c.dispose();
});

test('inactive capture ignores late input without persisting it',async()=>{
 const f=fixture();let active=true;f.port.active=()=>active;const c=await openInventoryCapture(f.port);assert.ok(c);
 const form={...c.snapshot().draft!,title:'Late input'};active=false;c.change(form);await c.flush();
 assert.equal(f.data.size,0);active=true;assert.equal(c.snapshot().draft?.title,'');c.dispose();
});
test('inactive new capture hides private text while preserving recovery',async()=>{
 const f=fixture();let active=true;f.port.active=()=>active;const c=await openInventoryCapture(f.port);assert.ok(c);
 c.change({...c.snapshot().draft!,private_notes:'Private draft'});await c.flush();const stored=[...f.data];active=false;
 assert.equal(c.snapshot().draft,null);assert.deepEqual([...f.data],stored);active=true;assert.equal(c.snapshot().draft?.private_notes,'Private draft');c.dispose();
});

test('picker identity survives restart without creating or dirtying an untouched capture',async()=>{
 const f=fixture();const first=await openInventoryCapture(f.port);assert.ok(first);
 const binding=await first.pickerTarget();assert.ok(binding);assert.match(binding.id,/^capture\//);
 assert.equal(first.snapshot().dirty,false);assert.equal(first.snapshot().busy,true);assert.equal(f.counts().creates,0);
 binding.release();binding.release();assert.equal(first.snapshot().busy,false);first.dispose();
 for(let i=0;i<40&&f.locked();i++)await Promise.resolve();
 const next=await openInventoryCapture(f.port);assert.ok(next);const restored=await next.pickerTarget();assert.ok(restored);
 assert.equal(restored.id,binding.id);assert.equal(next.snapshot().dirty,false);restored.release();await next.save();assert.equal(f.counts().creates,0);next.dispose();
});
test('picker target fails on storage loss and does not leave editor busy',async()=>{
 const f=fixture();const capture=await openInventoryCapture(f.port);assert.ok(capture);f.disk(true);
 assert.equal(await capture.pickerTarget(),null);assert.equal(capture.snapshot().busy,false);assert.equal(f.counts().creates,0);capture.dispose();
});
test('picker hold blocks scheduled creation but accepts explicit photo/create flow',async()=>{
 const f=fixture();const capture=await openInventoryCapture(f.port);assert.ok(capture);
 const binding=await capture.pickerTarget();assert.ok(binding);capture.change({...capture.snapshot().draft!,title:'While selecting'});await capture.flush();
 await f.tick();assert.equal(f.counts().creates,0);await capture.save();assert.equal(f.counts().creates,1);
 await assert.rejects(capture.pickerTarget(),/inventory_picker_busy/);binding.release();
 const recordBinding=await capture.pickerTarget();assert.ok(recordBinding);assert.equal(recordBinding.id,`record/${f.record()!.id}`);recordBinding.release();capture.dispose();
});
test('scope loss during picker target protection withholds identity and releases busy state',async()=>{
 const f=fixture();const capture=await openInventoryCapture(f.port);assert.ok(capture);let finish!:()=>void;
 f.holdCapture(()=>new Promise<void>(resolve=>{finish=resolve;}));const pending=capture.pickerTarget();
 for(let i=0;i<40&&!finish;i++)await Promise.resolve();assert.ok(finish);await assert.rejects(capture.pickerTarget(),/inventory_picker_busy/);
 f.port.active=()=>false;finish();assert.equal(await pending,null);assert.equal(capture.snapshot().draft,null);assert.equal(capture.snapshot().busy,false);assert.equal(f.counts().creates,0);capture.dispose();
});

test('releasing a picker target resumes eligible text autosave',async()=>{
 const f=fixture();const capture=await openInventoryCapture(f.port);assert.ok(capture);
 capture.change({...capture.snapshot().draft!,title:'Resume after camera'});await capture.flush();
 const binding=await capture.pickerTarget();assert.ok(binding);await f.tick();assert.equal(f.counts().creates,0);
 binding.release();await f.tick();assert.equal(f.counts().creates,1);assert.equal(f.record()?.attributes.title,'Resume after camera');capture.dispose();
});

for(const lostCreation of [false,true])test(`native photo handoff survives creation response loss=${lostCreation}`,async()=>{
 const {createHash}=await import('node:crypto');
 const {createNativePhotoPicker}=await import('./native-photo-picker');
 const {createNativePickerSession}=await import('./native-picker-session');
 const {createInventoryPhotoWorkspace}=await import('./inventory-photo-workspace');
 const {handoffCapturePhoto,discardCapturePhoto}=await import('./capture-photo-handoff');
 const {createInventoryCaptureLease}=await import('./inventory-capture');
 const f=fixture();const lease=createInventoryCaptureLease();const sha256=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 const handoff=(recordID:string,selection:Parameters<typeof handoffCapturePhoto>[0]['selection'])=>({userID:'user',dealerID:'shop',recordID,selection,active:()=>true,authorize:async()=>{},lease:()=>lease('user',recordID),storage:f.port.storage,sha256,now:f.port.now});
 const capture=await openInventoryCapture({...f.port,media:{sha256,handoff:(id,selection)=>handoffCapturePhoto(handoff(id,selection)),discard:(id,selection)=>discardCapturePhoto(handoff(id,selection))}});assert.ok(capture);
 let uploads=0;const items:{id:string;altText:string}[]=[];
 const list=async()=>({record:f.record()!,photos:[...items]});
 const photos=createInventoryPhotoWorkspace({userID:'user',dealerID:'shop',active:()=>true,recordID:()=>capture.recordID(),ensureRecord:()=>capture.ensureRecord(),capture:{stage:bytes=>capture.stagePhoto(bytes),pending:()=>capture.pendingPhoto(),discard:()=>capture.discardPhoto()},withMediaMutation:work=>capture.withMediaMutation(work),now:f.port.now,key:f.port.key,lease:id=>lease('user',id),storage:f.port.storage,sha256,classify:f.port.classify,
  list,upload:async(_id,bytes,_key,revision)=>{assert.deepEqual([...bytes],[255,216,255,217]);assert.equal(revision,f.record()!.revision);uploads++;items.push({id:'photo-one',altText:''});await f.port.edit('piano',f.record()!.attributes,revision);return {...await list(),photoID:'photo-one'};},reorder:async()=>{throw Error('unused');},describe:async()=>{throw Error('unused');},remove:async()=>{throw Error('unused');},
 });
 let cancel=true;let owner:string|null=null;
 const session=createNativePickerSession({active:()=>true,bind:async()=>{const binding=await capture.pickerTarget();assert.ok(binding);return {release:binding.release,picker:createNativePhotoPicker({scope:{userID:'user',dealerID:'shop',targetID:binding.id},active:()=>true,now:f.port.now,key:f.port.key,authorize:async()=>{},lease:async()=>()=>{},storage:f.port.storage,owner:{read:async()=>owner,write:async value=>{owner=value;}},pending:async()=>null,launch:async()=>cancel?{kind:'cancelled'}:{kind:'selected',asset:{uri:'file:///cache/source.jpg',width:2,height:2}},discard:async()=>{},accept:async(_asset,transferred)=>photos.add(new Uint8Array([255,216,255,217]),transferred)})};}});
 await session.restore();await session.select('camera');assert.equal(f.counts().creates,0);assert.equal(capture.snapshot().dirty,false);assert.equal(session.snapshot().held,false);
 cancel=false;await session.select('library');assert.equal(session.snapshot().held,true);assert.equal(f.counts().creates,0);assert.equal(uploads,0);
 f.lose(lostCreation);await session.consume();
 assert.equal(session.snapshot().state.status,'idle');
 if(lostCreation){assert.equal(uploads,0);f.lose(false);await photos.retryCapture();}
 assert.equal(f.counts().creates,lostCreation?2:1);assert.equal(new Set(f.keys).size,1);assert.equal(uploads,1);assert.equal(session.snapshot().held,false);assert.equal(photos.snapshot().entries.length,0);assert.equal(photos.snapshot().photos[0]?.id,'photo-one');
 await session.restore();assert.equal(uploads,1);assert.equal(capture.snapshot().dirty,false);await session.dispose();await photos.dispose();capture.dispose();
});

test('capture requires a record before voice attribution and forwards accepted origins after attachment',async()=>{
 const f=fixture();const sent:string[][]=[];
 const c=await openInventoryCapture({...f.port,edit:async(id,a,r,fields)=>{sent.push([...(fields??[])]);return f.port.edit(id,a,r);}});assert.ok(c);
 assert.throws(()=>c.change({...c.snapshot().draft!,make:'Steinway'},['make']),/inventory_voice_requires_record/);
 assert.equal(c.snapshot().draft?.make,'');assert.equal(f.counts().creates,0);
 assert.equal(await c.ensureRecord(),'piano');c.change({...c.snapshot().draft!,make:'Steinway'},['make']);
 await c.save();assert.deepEqual(sent,[['make']]);assert.equal(f.record()?.attributes.make,'Steinway');c.dispose();
});
