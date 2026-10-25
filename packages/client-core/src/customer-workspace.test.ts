import test from 'node:test';
import assert from 'node:assert/strict';
import {openCustomerWorkspace} from './customer-workspace.js';
import {createCustomerRecoveryJournal} from './customer-recovery.js';
import {emptyCustomerForm,customerFormFromAttributes,type CustomerWireAttributes} from './customer-form.js';
const scope={userID:'user',apiBaseURL:'https://api.example.test'};
const attrs=():CustomerWireAttributes=>({name:'Ada',isBusiness:false,email:'ada@example.test',locations:[{key:'home',label:'Home',street1:'1 Main',city:'Town',region:'State',postalCode:'123',timezone:'UTC'}],pianos:[]});
function fixture(){
 const values=new Map<string,string>(),events:string[]=[];let active=true,exists=true,denied=false;
 let value={id:'profile',revision:1,attributes:attrs()};
 const storage={async read(k:string){events.push('read');return values.get(k)??null;},async write(k:string,v:string){events.push('write');values.set(k,v);},async remove(k:string){events.push('remove');values.delete(k);}};
 const port={scope,now:()=>1000,active:()=>active,draft:emptyCustomerForm(),key:()=> 'stable-customer-key',storage:async()=>{events.push('storage');return storage;},isMissing:(e:unknown)=>e==='missing',classify:(e:unknown)=>e==='denied'?'denied' as const:'uncertain' as const,
 api:{get:async()=>{events.push('get');if(denied)throw 'denied';if(!exists)throw 'missing';return value;},timezones:async()=>{events.push('zones');return ['UTC'];},create:async(a:CustomerWireAttributes,key:string)=>{events.push('create:'+key);value={id:'profile',revision:1,attributes:a};exists=true;return value;},save:async(id:string,a:CustomerWireAttributes,revision:number)=>{events.push('save');if(denied)throw 'denied';value={id,revision:revision+1,attributes:a};return value;}}};
 return {port,storage,events,values,missing:()=>{exists=false;},deny:()=>{denied=true;},inactive:()=>{active=false;},server:(next:typeof value)=>{value=next;}};
}
test('customer workspace authorizes before loading protected drafts and maps form saves',async()=>{
 const f=fixture();const w=(await openCustomerWorkspace(f.port))!;assert.deepEqual(f.events.slice(0,4),['get','zones','storage','read']);
 const form=w.editor.snapshot()!.draft;form.name='Edited';await w.editor.edit(form);await w.editor.save();assert.equal(w.editor.snapshot()!.baseline!.revision,2);assert.ok(f.events.indexOf('write')<f.events.indexOf('save'));
 await w.close();const again=(await openCustomerWorkspace(f.port))!;assert.equal(again.editor.snapshot()!.draft.name,'Edited');assert.equal(again.restored,false);
});
test('customer denied opening does not consult storage; revoked cached baseline is discarded',async()=>{
 const f=fixture();const w=(await openCustomerWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'PRIVATE'});await w.close();f.deny();f.events.length=0;
 await assert.rejects(openCustomerWorkspace(f.port));assert.deepEqual(f.events,['get']);
 const g=fixture();const j=createCustomerRecoveryJournal({scope,storage:g.storage,zones:new Set(['UTC']),now:()=>1000});await j.save({version:1,baseline:{id:'profile',revision:1,attributes:customerFormFromAttributes(attrs())},draft:customerFormFromAttributes(attrs()),pending:null,conflict:false});g.missing();await assert.rejects(openCustomerWorkspace(g.port));assert.equal(g.values.size,0);
});
test('customer pending creation reopens with exact key and late denial clears recovery',async()=>{
 const f=fixture();f.missing();let interrupted=true;const create=f.port.api.create;f.port.api.create=async(a,k)=>{if(interrupted){await create(a,k);throw 'network';}return create(a,k);};
 const w=(await openCustomerWorkspace(f.port))!;await w.editor.edit(customerFormFromAttributes(attrs()));await w.editor.save();await w.close();interrupted=false;
 const restored=(await openCustomerWorkspace(f.port))!;assert.equal(restored.restored,true);await restored.editor.save();assert.equal(f.events.filter(e=>e==='create:stable-customer-key').length,2);
 f.deny();await restored.editor.save();assert.equal(restored.editor.snapshot(),null);await restored.cleanup();assert.equal(f.values.size,0);
});
test('customer workspace stops after scope loss before any storage disclosure',async()=>{
 const f=fixture();const get=f.port.api.get;f.port.api.get=async()=>{const v=await get();f.inactive();return v;};assert.equal(await openCustomerWorkspace(f.port),null);assert.deepEqual(f.events,['get']);
});

test('failed customer protection keeps the draft open and newer queued writes delay close',async()=>{
 const f=fixture();const write=f.storage.write;f.storage.write=async()=>{throw Error('PRIVATE');};const w=(await openCustomerWorkspace(f.port))!;await w.editor.edit({...w.editor.snapshot()!.draft,name:'Retain'});assert.equal(await w.protect(),false);assert.equal(await w.close(),false);assert.equal(w.editor.snapshot()!.draft.name,'Retain');f.storage.write=write;await w.editor.edit(w.editor.snapshot()!.draft);assert.equal(await w.close(),true);
 const g=fixture();let first!:()=>void,second!:()=>void;const gates=[new Promise<void>(r=>{first=r;}),new Promise<void>(r=>{second=r;})];const original=g.storage.write;let writes=0;g.storage.write=async(k,v)=>{await gates[writes++];await original(k,v);};
 const v=(await openCustomerWorkspace(g.port))!;const edit1=v.editor.edit({...v.editor.snapshot()!.draft,name:'First'});await new Promise(r=>setImmediate(r));let protectedDraft=false;const protecting=v.protect().then(ok=>{protectedDraft=ok;});const edit2=v.editor.edit({...v.editor.snapshot()!.draft,name:'Second'});first();await new Promise(r=>setImmediate(r));assert.equal(protectedDraft,false);second();await Promise.all([edit1,edit2,protecting]);assert.equal(protectedDraft,true);
 const reopened=(await openCustomerWorkspace(g.port))!;assert.equal(reopened.editor.snapshot()!.draft.name,'Second');
});
