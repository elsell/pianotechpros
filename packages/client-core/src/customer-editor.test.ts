import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerEditor,type CustomerEditorCheckpoint,type CustomerEditorRecord} from './customer-editor.js';
import {emptyCustomerForm} from './customer-form.js';
const draft=()=>({...emptyCustomerForm(),name:'Ada',email:'ada@example.test',locations:[{key:'home',label:'Home',street1:'1 Main',street2:'',city:'Town',region:'State',postalCode:'123',timezone:'UTC',notes:''}]});
const record=(revision=1):CustomerEditorRecord=>({id:'profile',revision,attributes:draft()});
function fixture(initial:CustomerEditorRecord|null=null,recovery?:CustomerEditorCheckpoint){
 let stored:CustomerEditorCheckpoint|undefined,failStorage=false,active=true,result='ok';let release:(()=>void)|undefined,gate:Promise<void>|undefined;
 const calls:{kind:string;key?:string;revision?:number;name:string}[]=[];
 let remote=record();
 const port={initial,draft:draft(),recovery,zones:new Set(['UTC']),active:()=>active,key:()=> 'stable-customer-key',persist:async(cp:CustomerEditorCheckpoint)=>{if(failStorage)throw Error('PRIVATE');stored=JSON.parse(JSON.stringify(cp));},classify:(e:unknown)=>e as 'conflict'|'rejected'|'denied'|'uncertain',get:async()=>{calls.push({kind:'get',name:''});return remote;},
 create:async(a:ReturnType<typeof draft>,key:string)=>{calls.push({kind:'create',key,name:a.name});await gate;if(result!=='ok')throw result;return {...record(),attributes:a};},
 update:async(id:string,a:ReturnType<typeof draft>,revision:number)=>{calls.push({kind:'save',revision,name:a.name});await gate;if(result!=='ok')throw result;return {id,revision:revision+1,attributes:a};}};
 return {editor:createCustomerEditor(port),calls,stored:()=>stored!,failStorage:()=>{failStorage=true;},result:(v:string)=>{result=v;},remote:(v:CustomerEditorRecord)=>{remote=v;},pause:()=>{gate=new Promise<void>(r=>{release=r;});},release:()=>release!(),inactive:()=>{active=false;}};
}
test('customer pending creation is durable and retries the original command while retaining later edits',async()=>{
 const f=fixture();f.result('uncertain');await f.editor.save();assert.equal(f.stored().pending?.kind,'create');assert.equal(f.editor.snapshot()!.failure,'uncertain');
 const changed=draft();changed.name='Later';await f.editor.edit(changed);
 const restored=fixture(null,f.stored());await restored.editor.save();assert.equal(restored.calls[0]!.name,'Ada');assert.equal(restored.calls[0]!.key,'stable-customer-key');assert.equal(restored.editor.snapshot()!.draft.name,'Later');assert.equal(restored.editor.snapshot()!.baseline!.attributes.name,'Ada');assert.equal(restored.editor.snapshot()!.dirty,true);
 await restored.editor.save();assert.equal(restored.calls[1]!.kind,'save');assert.equal(restored.calls[1]!.name,'Later');assert.equal(restored.editor.snapshot()!.dirty,false);
});
test('customer persistence failure prevents network and asynchronous replies preserve newer edits',async()=>{
 const failed=fixture();failed.failStorage();await failed.editor.save();assert.equal(failed.calls.length,0);assert.equal(failed.editor.snapshot()!.failure,'storage');
 const f=fixture(record());f.pause();const saving=f.editor.save();await new Promise(r=>setImmediate(r));const edit=draft();edit.name='Newer';await f.editor.edit(edit);f.release();await saving;assert.equal(f.editor.snapshot()!.draft.name,'Newer');assert.equal(f.editor.snapshot()!.baseline!.revision,2);assert.equal(f.editor.snapshot()!.dirty,true);
 const snapshot=f.editor.snapshot()!;snapshot.draft.locations[0]!.label='Mutated';assert.equal(f.editor.snapshot()!.draft.locations[0]!.label,'Home');
});
test('customer conflict requires review and explicit choice without losing draft',async()=>{
 const f=fixture(record());const edit=draft();edit.name='Local';await f.editor.edit(edit);f.result('conflict');await f.editor.save();assert.equal(f.editor.snapshot()!.conflict,true);await f.editor.keepEdits();assert.equal(f.editor.snapshot()!.conflict,true);
 f.remote({...record(3),attributes:{...draft(),name:'Remote'}});await f.editor.review();assert.equal(f.editor.snapshot()!.draft.name,'Local');await f.editor.keepEdits();f.result('ok');await f.editor.save();assert.equal(f.calls.at(-1)!.revision,3);
 const g=fixture(record());g.result('conflict');await g.editor.save();g.remote(record(2));await g.editor.review();await g.editor.useLatest();assert.equal(g.editor.snapshot()!.baseline!.revision,2);assert.equal(g.editor.snapshot()!.dirty,false);
});
test('scope loss suppresses a late customer response and invalid restoration is refused',async()=>{
 const f=fixture();f.pause();const saving=f.editor.save();await new Promise(r=>setImmediate(r));f.inactive();f.release();await saving;assert.equal(f.editor.snapshot(),null);
 assert.throws(()=>fixture(null,{version:1,baseline:null,draft:{},pending:null,conflict:false} as CustomerEditorCheckpoint));
});

test('customer review rechecks scope after observers run before sending a read',async()=>{
 const f=fixture(record());f.result('conflict');await f.editor.save();
 f.editor.subscribe(state=>{if(state?.busy)f.editor.dispose();});
 await f.editor.review();assert.equal(f.calls.filter(c=>c.kind==='get').length,0);assert.equal(f.editor.snapshot(),null);
});

test('restored customer baseline never rolls backwards to an older server revision',async()=>{
 const f=fixture(record(4));await f.editor.edit({...draft(),name:'Local'});
 const restored=fixture(record(2),f.stored());assert.equal(restored.editor.snapshot()!.conflict,true);assert.equal(restored.editor.snapshot()!.latest,null);
 await restored.editor.keepEdits();assert.equal(restored.editor.snapshot()!.baseline!.revision,4);assert.equal(restored.editor.snapshot()!.conflict,true);
});
