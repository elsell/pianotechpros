import test from 'node:test';import assert from 'node:assert/strict';
import {createInventoryEditor,isInventoryEditorCheckpoint,type InventoryEditorCheckpoint} from './inventory-editor';
const initial={id:'p',dealer_id:'d',revision:1,attributes:{make:'',model:''}};
type A=typeof initial.attributes;type R=typeof initial;
function fixture(recovery?:InventoryEditorCheckpoint<A,R>){
 let current=structuredClone(initial),failure=false,lose=false;
 const sent:{attributes:A;revision:number;voiceFields:string[]}[]=[];
 const policy={fields:['make','model'],changed:(a:A,b:A)=>['make','model'].filter(k=>a[k as keyof A]!==b[k as keyof A])};
 const c=createInventoryEditor({initial:current,recovery,attribution:policy,copy:(a:A)=>({...a}),equal:(a,b)=>a.make===b.make&&a.model===b.model,classify:(e:unknown)=>e==='conflict'?'conflict':'uncertain',get:async()=>structuredClone(current),edit:async(attributes,revision,voiceFields)=>{sent.push({attributes:{...attributes},revision,voiceFields:[...(voiceFields??[])]});if(failure)throw 'network';if(current.revision!==revision)throw 'conflict';current={...current,revision:revision+1,attributes:{...attributes}};if(lose)throw 'network';return structuredClone(current);}});
 return {c,sent,fail:(v:boolean)=>{failure=v;},lose:()=>{lose=true;},remote:(r:R)=>{current=structuredClone(r);},current:()=>structuredClone(current)};
}
test('voice attribution survives checkpoints; later manual edits clear only changed fields',async()=>{
 const f=fixture();f.c.change({make:'Steinway',model:'B'},['make','model']);const checkpoint=f.c.checkpoint()!;
 const restored=fixture(checkpoint);checkpoint.voiceFields![0]='wrong';
 restored.c.change({make:'Manual',model:'B'});await restored.c.save();assert.deepEqual(restored.sent[0].voiceFields,['model']);assert.equal(restored.c.checkpoint()?.voiceFields,undefined);
});
test('uncertain retries preserve original attribution despite later edits and restart',async()=>{
 const f=fixture();f.c.change({make:'Steinway',model:''},['make']);f.fail(true);await f.c.save();f.c.change({make:'Manual',model:'B'},['model']);
 const saved=f.c.checkpoint()!;assert.deepEqual(saved.pending?.voiceFields,['make']);assert.deepEqual(saved.voiceFields,['model']);
 const restored=fixture(saved);await restored.c.save();assert.deepEqual(restored.sent[0],{attributes:{make:'Steinway',model:''},revision:1,voiceFields:['make']});
 await restored.c.save();assert.deepEqual(restored.sent[1],{attributes:{make:'Manual',model:'B'},revision:2,voiceFields:['model']});
});
test('lost acknowledgement clears only committed origins and retains later voice changes',async()=>{
 const f=fixture();f.c.change({make:'Steinway',model:''},['make']);f.lose();await f.c.save();f.c.change({make:'Steinway',model:'B'},['model']);const restored=fixture(f.c.checkpoint()!);restored.remote(f.current());await restored.c.recover();assert.deepEqual(restored.c.checkpoint()?.voiceFields,['model']);assert.equal(restored.c.checkpoint()?.pending,null);
});
test('invalid and aliased attribution cannot enter recovery or label unchanged fields',()=>{
 const f=fixture();assert.throws(()=>f.c.change({make:'',model:''},['make']));assert.throws(()=>f.c.change({make:'a',model:''},['status']));assert.throws(()=>f.c.change({make:'a',model:''},['make','make']));
 f.c.change({make:'a',model:''},['make']);const saved=f.c.checkpoint()!;assert.throws(()=>fixture({...saved,voiceFields:['status']}));assert.throws(()=>fixture({...saved,voiceFields:['make','make']}));
 f.c.dispose();assert.equal(f.c.checkpoint(),null);
});
import {createInventoryWorkspace} from './inventory-workspace';
test('workspace durably stores attribution before forwarding the same save attempt',async()=>{
 let stored:InventoryEditorCheckpoint<A,R>|null=null;const seen:string[][]=[];
 const workspace=createInventoryWorkspace({initial,copy:(a:A)=>({...a}),equal:(a,b)=>a.make===b.make&&a.model===b.model,valid:()=>true,attribution:{fields:['make','model'],changed:(a:A,b:A)=>['make','model'].filter(k=>a[k as keyof A]!==b[k as keyof A])},classify:()=> 'uncertain',schedule:()=>()=>{},get:async()=>initial,journal:{save:async c=>{stored=structuredClone(c);},discard:async()=>{stored=null;}},edit:async(a,revision,fields)=>{assert.deepEqual(stored?.pending?.voiceFields,['make']);seen.push([...(fields??[])]);return {...initial,revision:revision+1,attributes:a};}});
 workspace.change({make:'Steinway',model:'B'},['make']);await workspace.flush();assert.deepEqual((stored as InventoryEditorCheckpoint<A,R>|null)?.voiceFields,['make']);await workspace.save();assert.deepEqual(seen,[['make']]);workspace.dispose();
});

test('protected checkpoint validation rejects malformed metadata but accepts legacy manual journals',()=>{
 const f=fixture();const saved=f.c.checkpoint()!;
 const attrs=(v:unknown):v is A=>!!v&&typeof v==='object'&&'make'in v&&typeof v.make==='string'&&'model'in v&&typeof v.model==='string';
 const row=(v:unknown):v is R=>!!v&&typeof v==='object'&&'attributes'in v&&attrs(v.attributes);
 const valid=(v:unknown)=>isInventoryEditorCheckpoint(v,{dealerID:'d',recordID:'p'},attrs,row,['make','model']);
 assert.equal(valid(saved),true);
 for(const bad of [null,'make',['status'],['make','make'],Array(19).fill('make'),[1]]){
  assert.equal(valid({...saved,voiceFields:bad}),false);
  assert.equal(valid({...saved,pending:{attributes:initial.attributes,revision:1,voiceFields:bad}}),false);
 }
});
test('conflict choices preserve local origins only when retaining local values',async()=>{
 for(const keep of [true,false]){
  const f=fixture();f.c.change({make:'Local',model:''},['make']);f.remote({...initial,revision:2,attributes:{make:'Remote',model:''}});await f.c.save();await f.c.recover();
  if(keep)f.c.keepEdits();else f.c.useLatest();
  assert.deepEqual(f.c.checkpoint()?.voiceFields,keep?['make']:undefined);
 }
});
test('voice restoring an old baseline during a pending write retains its origin after that write lands',async()=>{
 const f=fixture();f.c.change({make:'Manual pending',model:''});f.fail(true);await f.c.save();f.c.change({make:'',model:''},['make']);
 const restored=fixture(f.c.checkpoint()!);await restored.c.save();await restored.c.save();
 assert.deepEqual(restored.sent.map(s=>s.voiceFields),[[],['make']]);assert.equal(restored.current().attributes.make,'');
});
test('lost acknowledgement followed by voice restoration of old baseline survives restart and recovery',async()=>{
 const f=fixture();f.c.change({make:'Committed',model:''});f.lose();await f.c.save();f.c.change({make:'',model:''},['make']);
 const restored=fixture(f.c.checkpoint()!);restored.remote(f.current());await restored.c.recover();await restored.c.save();assert.deepEqual(restored.sent[0].voiceFields,['make']);assert.equal(restored.sent[0].revision,2);
});
