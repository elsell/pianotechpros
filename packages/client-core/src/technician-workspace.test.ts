import test from 'node:test';
import assert from 'node:assert/strict';
import {openTechnicianWorkspace,type TechnicianWorkspace} from './technician-workspace.js';
import {createTechnicianOwnershipRegistry} from './technician-ownership.js';
import {createTechnicianPresentationLifetime} from './technician-presentation.js';
import {createTechnicianRecoveryJournal} from './technician-recovery.js';
import {emptyTechnicianForm,technicianFormFromAttributes,type TechnicianWireAttributes} from './technician-form.js';
const scope={userID:'user',apiBaseURL:'https://api.example.test'};
const attrs=():TechnicianWireAttributes=>({name:'Ada',businessName:'',email:'ada@example.test',phone:'',biography:'',origin:{label:'Shop',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC'},radiusMiles:25,drivingMinutes:null,services:['tuning'],forms:['grand'],searchable:false,acceptsRequestsWithoutAvailability:false,availability:[]});
function fixture(){
 const values=new Map<string,string>(),events:string[]=[];let active=true,exists=true,denied=false;
 let value={id:'profile',revision:1,attributes:attrs()};
 const storage={async read(k:string){events.push('read');return values.get(k)??null;},async write(k:string,v:string){events.push('write');values.set(k,v);},async remove(k:string){events.push('remove');values.delete(k);}};
 const port={scope,ownership:createTechnicianOwnershipRegistry(),now:()=>1000,active:()=>active,draft:emptyTechnicianForm(),key:()=> 'stable-technician-key',storage:async()=>{events.push('storage');return storage;},isMissing:(e:unknown)=>e==='missing',classify:(e:unknown)=>e==='denied'?'denied' as const:'uncertain' as const,
 api:{get:async()=>{events.push('get');if(denied)throw 'denied';if(!exists)throw 'missing';return value;},timezones:async()=>{events.push('zones');return ['UTC'];},create:async(a:TechnicianWireAttributes,key:string)=>{events.push('create:'+key);value={id:'profile',revision:1,attributes:a};exists=true;return value;},save:async(id:string,a:TechnicianWireAttributes,revision:number)=>{events.push('save');if(denied)throw 'denied';value={id,revision:revision+1,attributes:a};return value;}}};
 return {port,storage,events,values,missing:()=>{exists=false;},deny:()=>{denied=true;},inactive:()=>{active=false;},server:(next:typeof value)=>{value=next;}};
}
test('technician workspace authorizes before loading protected drafts and maps form saves',async()=>{
 const f=fixture();const w=(await openTechnicianWorkspace(f.port))!;assert.deepEqual(f.events.slice(0,4),['get','zones','storage','read']);
 const form=w.editor.snapshot()!.draft;form.name='Edited';await w.editor.edit(form);await w.editor.save();assert.equal(w.editor.snapshot()!.baseline!.revision,2);assert.ok(f.events.indexOf('write')<f.events.indexOf('save'));
 await w.close();const again=(await openTechnicianWorkspace(f.port))!;assert.equal(again.editor.snapshot()!.draft.name,'Edited');assert.equal(again.restored,false);
});
test('technician denied opening does not consult storage; revoked cached baseline is discarded',async()=>{
 const f=fixture();const w=(await openTechnicianWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'PRIVATE'});await w.close();f.deny();f.events.length=0;
 await assert.rejects(openTechnicianWorkspace(f.port));assert.deepEqual(f.events,['get']);
 const g=fixture();const j=createTechnicianRecoveryJournal({scope,storage:g.storage,zones:new Set(['UTC']),now:()=>1000});await j.save({version:1,baseline:{id:'profile',revision:1,attributes:technicianFormFromAttributes(attrs())},draft:technicianFormFromAttributes(attrs()),pending:null,conflict:false});g.missing();await assert.rejects(openTechnicianWorkspace(g.port));assert.equal(g.values.size,0);
});
test('technician pending creation reopens with exact key and late denial clears recovery',async()=>{
 const f=fixture();f.missing();let interrupted=true;const create=f.port.api.create;f.port.api.create=async(a,k)=>{if(interrupted){await create(a,k);throw 'network';}return create(a,k);};
 const w=(await openTechnicianWorkspace(f.port))!;await w.editor.edit(technicianFormFromAttributes(attrs()));await w.editor.save();await w.close();interrupted=false;
 const restored=(await openTechnicianWorkspace(f.port))!;assert.equal(restored.restored,true);await restored.editor.save();assert.equal(f.events.filter(e=>e==='create:stable-technician-key').length,2);
 f.deny();await restored.editor.save();assert.equal(restored.editor.snapshot(),null);await restored.cleanup();assert.equal(f.values.size,0);
});
test('technician workspace stops after scope loss before any storage disclosure',async()=>{
 const f=fixture();const get=f.port.api.get;f.port.api.get=async()=>{const v=await get();f.inactive();return v;};assert.equal(await openTechnicianWorkspace(f.port),null);assert.deepEqual(f.events,['get']);
});

test('failed technician protection keeps the draft open and newer queued writes delay close',async()=>{
 const f=fixture();const write=f.storage.write;f.storage.write=async()=>{throw Error('PRIVATE');};const w=(await openTechnicianWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'Retain'});assert.equal(await w.protect(),false);assert.equal(await w.close(),false);await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_busy');assert.equal(w.editor.snapshot()!.draft.name,'Retain');f.storage.write=write;await w.editor.edit(w.editor.snapshot()!.draft);assert.equal(await w.close(),true);
 const g=fixture();let first!:()=>void,second!:()=>void;const gates=[new Promise<void>(r=>{first=r;}),new Promise<void>(r=>{second=r;})];const original=g.storage.write;let writes=0;g.storage.write=async(k,v)=>{await gates[writes++];await original(k,v);};
 const v=(await openTechnicianWorkspace(g.port))!;const edit1=v.editor.edit({...v.editor.snapshot()!.draft,name:'First'});await new Promise(r=>setImmediate(r));let protectedDraft=false;const protecting=v.protect().then(ok=>{protectedDraft=ok;});const edit2=v.editor.edit({...v.editor.snapshot()!.draft,name:'Second'});first();await new Promise(r=>setImmediate(r));assert.equal(protectedDraft,false);second();await Promise.all([edit1,edit2,protecting]);assert.equal(protectedDraft,true);
 await v.close();const reopened=(await openTechnicianWorkspace(g.port))!;assert.equal(reopened.editor.snapshot()!.draft.name,'Second');
});

test('technician ownership rejects concurrent open and releases after failed opening',async()=>{
 const f=fixture();const w=(await openTechnicianWorkspace(f.port))!;f.events.length=0;
 await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_busy');assert.deepEqual(f.events,[]);
 await w.close();f.deny();await assert.rejects(openTechnicianWorkspace(f.port));await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_access');
});
test('technician ownership remains held through delayed discard and retries failed cleanup',async()=>{
 const f=fixture();const w=(await openTechnicianWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'Draft'});
 const remove=f.storage.remove;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let fail=true;f.storage.remove=async key=>{await gate;if(fail)throw Error('PRIVATE');await remove(key);};
 f.deny();await w.editor.save();await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_busy');release();await assert.rejects(w.cleanup());
 await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_busy');fail=false;await w.cleanup();assert.equal(f.values.size,0);
 await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_access');
});

test('runtime presentation retains denied cleanup across route unmount and remount',async()=>{
 const f=fixture(),lifetime=createTechnicianPresentationLifetime();
 const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
 let workspace:Awaited<ReturnType<typeof openTechnicianWorkspace>>=null,errors=0;
 const port={open:()=>openTechnicianWorkspace(f.port),ready:(value:NonNullable<typeof workspace>)=>{workspace=value;},failed:()=>{errors++;}};
 const unmount=lifetime.start(port);await turn();assert.ok(workspace);
 const opened=workspace as TechnicianWorkspace;
 await opened.editor.edit({...opened.editor.snapshot()!.draft,name:'Protected'});
 const remove=f.storage.remove;let fail=true;
 f.storage.remove=async key=>{if(fail)throw Error('storage');await remove(key);};
 f.deny();await opened.editor.save();assert.equal(opened.editor.snapshot(),null);
 unmount();await turn();assert.ok(f.values.size>0);
 const failedMount=lifetime.start(port);await turn();assert.equal(errors,1);
 failedMount();await turn();fail=false;
 // The runtime lifetime survives both component instances and drains the old
 // journal before a new authorization attempt, which correctly still denies.
 const finalMount=lifetime.start(port);await turn();assert.equal(errors,2);assert.equal(f.values.size,0);
 await assert.rejects(openTechnicianWorkspace(f.port),error=>error instanceof Error&&error.message==='technician_workspace_access');
 finalMount();await turn();
});

test('technician disposal holds ownership until in-flight storage drains',async()=>{
 const f=fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const write=f.storage.write;
 f.storage.write=async(k,v)=>{await gate;await write(k,v);};
 const w=(await openTechnicianWorkspace(f.port))!;const edit=w.editor.edit({...w.editor.snapshot()!.draft,name:'Protected'});
 await new Promise(r=>setImmediate(r));w.dispose();
 await assert.rejects(openTechnicianWorkspace(f.port),e=>e instanceof Error&&e.message==='technician_workspace_busy');
 release();await edit;await w.cleanup();const next=(await openTechnicianWorkspace(f.port))!;assert.equal(next.editor.snapshot()!.draft.name,'Protected');await next.close();
});

test('technician opening snapshots ownership and journal scope before asynchronous callbacks',async()=>{
 const f=fixture();f.port.scope={...scope};const initial={...f.port.scope};const storage=f.port.storage;
 f.port.storage=async()=>{f.port.scope.userID='changed-user';return storage();};
 const w=(await openTechnicianWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'Original owner'});
 const original=createTechnicianRecoveryJournal({scope:initial,storage:f.storage,zones:new Set(['UTC']),now:f.port.now});
 assert.equal((await original.load()).checkpoint?.draft.name,'Original owner');
 const changed=createTechnicianRecoveryJournal({scope:f.port.scope,storage:f.storage,zones:new Set(['UTC']),now:f.port.now});assert.equal((await changed.load()).checkpoint,null);
 await w.close();
});
