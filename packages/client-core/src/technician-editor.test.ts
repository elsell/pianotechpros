import test from 'node:test';
import assert from 'node:assert/strict';
import {createTechnicianEditor,type TechnicianEditorCheckpoint,type TechnicianEditorRecord,isTechnicianEditorCheckpoint} from './technician-editor.js';
import {emptyTechnicianForm} from './technician-form.js';
const draft=()=>({...emptyTechnicianForm(),name:'Ada',email:'ada@example.test',origin:{label:'Shop',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC'},radiusMiles:'25',services:['tuning'],forms:['grand'],availability:[{key:'monday',kind:'available',recurrence:'weekly',weekday:0,start:'09:00',end:'17:00',timezone:'UTC',effectiveStart:'',effectiveEnd:''}]});
const record=(revision=1):TechnicianEditorRecord=>({id:'profile',revision,attributes:draft()});
function fixture(initial:TechnicianEditorRecord|null=null,recovery?:TechnicianEditorCheckpoint){
 let stored:TechnicianEditorCheckpoint|undefined,failStorage=false,active=true,result='ok';let release:(()=>void)|undefined,gate:Promise<void>|undefined;
 const calls:{kind:string;key?:string;revision?:number;name:string;end?:string}[]=[];
 let remote=record();
 const port={initial,draft:draft(),recovery,zones:new Set(['UTC']),active:()=>active,key:()=> 'stable-technician-key',persist:async(cp:TechnicianEditorCheckpoint)=>{if(failStorage)throw Error('PRIVATE');stored=JSON.parse(JSON.stringify(cp));},classify:(e:unknown)=>e as 'conflict'|'rejected'|'denied'|'uncertain',get:async()=>{calls.push({kind:'get',name:''});return remote;},
 create:async(a:ReturnType<typeof draft>,key:string)=>{calls.push({kind:'create',key,name:a.name,end:a.availability[0]?.end});await gate;if(result!=='ok')throw result;return {...record(),attributes:a};},
 update:async(id:string,a:ReturnType<typeof draft>,revision:number)=>{calls.push({kind:'save',revision,name:a.name,end:a.availability[0]?.end});await gate;if(result!=='ok')throw result;return {id,revision:revision+1,attributes:a};}};
 return {editor:createTechnicianEditor(port),calls,stored:()=>stored!,failStorage:()=>{failStorage=true;},result:(v:string)=>{result=v;},remote:(v:TechnicianEditorRecord)=>{remote=v;},pause:()=>{gate=new Promise<void>(r=>{release=r;});},release:()=>release!(),inactive:()=>{active=false;}};
}
test('technician pending creation is durable and retries the original command while retaining later edits',async()=>{
 const f=fixture();f.result('uncertain');await f.editor.save();assert.equal(f.stored().pending?.kind,'create');assert.equal(f.editor.snapshot()!.failure,'uncertain');
 const changed=draft();changed.name='Later';await f.editor.edit(changed);
 const restored=fixture(null,f.stored());await restored.editor.save();assert.equal(restored.calls[0]!.name,'Ada');assert.equal(restored.calls[0]!.key,'stable-technician-key');assert.equal(restored.editor.snapshot()!.draft.name,'Later');assert.equal(restored.editor.snapshot()!.baseline!.attributes.name,'Ada');assert.equal(restored.editor.snapshot()!.dirty,true);
 await restored.editor.save();assert.equal(restored.calls[1]!.kind,'save');assert.equal(restored.calls[1]!.name,'Later');assert.equal(restored.editor.snapshot()!.dirty,false);
});
test('technician persistence failure prevents network and asynchronous replies preserve newer edits',async()=>{
 const failed=fixture();failed.failStorage();await failed.editor.save();assert.equal(failed.calls.length,0);assert.equal(failed.editor.snapshot()!.failure,'storage');
 const f=fixture(record());f.pause();const saving=f.editor.save();await new Promise(r=>setImmediate(r));const edit=draft();edit.name='Newer';await f.editor.edit(edit);f.release();await saving;assert.equal(f.editor.snapshot()!.draft.name,'Newer');assert.equal(f.editor.snapshot()!.baseline!.revision,2);assert.equal(f.editor.snapshot()!.dirty,true);
 const snapshot=f.editor.snapshot()!;snapshot.draft.availability[0]!.end='15:00';assert.equal(f.editor.snapshot()!.draft.availability[0]!.end,'17:00');
});
test('technician conflict requires review and explicit choice without losing draft',async()=>{
 const f=fixture(record());const edit=draft();edit.name='Local';await f.editor.edit(edit);f.result('conflict');await f.editor.save();assert.equal(f.editor.snapshot()!.conflict,true);await f.editor.keepEdits();assert.equal(f.editor.snapshot()!.conflict,true);
 f.remote({...record(3),attributes:{...draft(),name:'Remote'}});await f.editor.review();assert.equal(f.editor.snapshot()!.draft.name,'Local');await f.editor.keepEdits();f.result('ok');await f.editor.save();assert.equal(f.calls.at(-1)!.revision,3);
 const g=fixture(record());g.result('conflict');await g.editor.save();g.remote(record(2));await g.editor.review();await g.editor.useLatest();assert.equal(g.editor.snapshot()!.baseline!.revision,2);assert.equal(g.editor.snapshot()!.dirty,false);
});
test('scope loss suppresses a late technician response and invalid restoration is refused',async()=>{
 const f=fixture();f.pause();const saving=f.editor.save();await new Promise(r=>setImmediate(r));f.inactive();f.release();await saving;assert.equal(f.editor.snapshot(),null);
 assert.throws(()=>fixture(null,{version:1,baseline:null,draft:{},pending:null,conflict:false} as TechnicianEditorCheckpoint));
});

test('technician review rechecks scope after observers run before sending a read',async()=>{
 const f=fixture(record());f.result('conflict');await f.editor.save();
 f.editor.subscribe(state=>{if(state?.busy)f.editor.dispose();});
 await f.editor.review();assert.equal(f.calls.filter(c=>c.kind==='get').length,0);assert.equal(f.editor.snapshot(),null);
});

test('restored technician baseline never rolls backwards to an older server revision',async()=>{
 const f=fixture(record(4));await f.editor.edit({...draft(),name:'Local'});
 const restored=fixture(record(2),f.stored());assert.equal(restored.editor.snapshot()!.conflict,true);assert.equal(restored.editor.snapshot()!.latest,null);
 await restored.editor.keepEdits();assert.equal(restored.editor.snapshot()!.baseline!.revision,4);assert.equal(restored.editor.snapshot()!.conflict,true);
});

 test('technician exact retries preserve original weekly rules while retaining newer incomplete inputs',async()=>{
 const f=fixture(record());f.result('uncertain');await f.editor.save();
 const changed=draft();changed.availability[0]!.end='18:';changed.radiusMiles='2.';await f.editor.edit(changed);
 const restored=fixture(record(),f.stored());await restored.editor.save();assert.equal(restored.calls[0]!.end,'17:00');assert.equal(restored.editor.snapshot()!.draft.availability[0]!.end,'18:');assert.equal(restored.editor.snapshot()!.draft.radiusMiles,'2.');
 await restored.editor.save();assert.equal(restored.calls.length,1);assert.ok(restored.editor.snapshot()!.issues.length);
 });
 test('technician checkpoints reject invalid baselines and incompatible pending identity',()=>{
 const cp:TechnicianEditorCheckpoint={version:1,baseline:record(),draft:draft(),pending:null,conflict:false};
 cp.baseline!.attributes.radiusMiles='invalid';assert.equal(isTechnicianEditorCheckpoint(cp,new Set(['UTC'])),false);
 cp.baseline=record();cp.pending={kind:'save',id:'foreign',revision:1,attributes:draft()};assert.equal(isTechnicianEditorCheckpoint(cp,new Set(['UTC'])),false);
 cp.pending={kind:'save',id:'profile',revision:2,attributes:draft()};assert.equal(isTechnicianEditorCheckpoint(cp,new Set(['UTC'])),false);
 });
