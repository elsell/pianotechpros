import assert from 'node:assert/strict';
import test from 'node:test';
import type {InventoryWireAttributes} from './inventory-form';
import {openInventoryFormWorkspace} from './inventory-form-workspace.js';
const initial:{id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes}={id:'piano',dealer_id:'shop',revision:1,attributes:{stock_number:'A',title:'Original'}};
function fixture(){
 let remote=structuredClone(initial);let data:string|null=null;let storageOpened=0;let writes=0;let failure=false;let active=true;
 const port={scope:{userID:'u',dealerID:'shop',recordID:'piano'},decimal:',' as const,active:()=>active,now:()=>1000,storage:async()=>{storageOpened++;return {read:async()=>data,write:async(_:string,v:string)=>{data=v;},remove:async()=>{data=null;}};},get:async()=>{if(failure)throw Error('denied');return structuredClone(remote);},edit:async(a:typeof initial.attributes,revision:number)=>{writes++;remote={...remote,revision:revision+1,attributes:a};return structuredClone(remote);},classify:()=> 'uncertain' as const,schedule:()=>()=>{}};
 return {port,opened:()=>storageOpened,writes:()=>writes,deny:()=>{failure=true;},stop:()=>{active=false;},remote:(r:typeof initial)=>{remote=r;}};
}
test('current access is required before opening storage or displaying recovery',async()=>{
 const f=fixture();f.deny();await assert.rejects(openInventoryFormWorkspace(f.port));assert.equal(f.opened(),0);assert.equal(f.writes(),0);
 const g=fixture();g.stop();assert.equal(await openInventoryFormWorkspace(g.port),null);assert.equal(g.opened(),0);
});
test('raw input and its decimal convention survive a changed locale, without an automatic mutation',async()=>{
 const f=fixture();const first=await openInventoryFormWorkspace(f.port);assert.ok(first);first.change({...first.snapshot().draft!,asking_amount:'12,'});assert.equal(await first.flush(),true);first.dispose();
 const restored=await openInventoryFormWorkspace({...f.port,decimal:'.'});assert.ok(restored);assert.equal(restored.snapshot().draft?.asking_amount,'12,');assert.equal(restored.snapshot().draft?.decimal,',');assert.equal(restored.snapshot().invalid,true);assert.equal(f.writes(),0);
 await restored.save();assert.equal(f.writes(),0);restored.dispose();
});
test('reopened stale drafts require current-version review and never silently rebase',async()=>{
 const f=fixture();const first=await openInventoryFormWorkspace(f.port);assert.ok(first);first.change({...first.snapshot().draft!,title:'Local'});await first.flush();first.dispose();f.remote({...initial,revision:2,attributes:{...initial.attributes,title:'Concurrent'}});
 const next=await openInventoryFormWorkspace(f.port);assert.ok(next);assert.equal(next.snapshot().conflict,true);await next.save();assert.equal(f.writes(),0);await next.recover();assert.equal(next.snapshot().latest?.attributes.title,'Concurrent');next.useLatest();assert.equal(next.snapshot().draft?.title,'Concurrent');next.dispose();
});
test('a clean saved checkpoint does not pause a fresh editor or conflict with newer server data',async()=>{
 const f=fixture();const first=await openInventoryFormWorkspace(f.port);assert.ok(first);await first.flush();first.dispose();f.remote({...initial,revision:2,attributes:{...initial.attributes,title:'Updated remotely'}});
 const next=await openInventoryFormWorkspace(f.port);assert.ok(next);assert.equal(next.snapshot().restored,false);assert.equal(next.snapshot().conflict,false);assert.equal(next.snapshot().draft?.title,'Updated remotely');next.dispose();
});

test('accepted voice fields survive protected recovery while manual corrections clear only their field',async()=>{
 const f=fixture();const sent:string[][]=[];
 const port={...f.port,edit:async(a:typeof initial.attributes,r:number,fields?:readonly string[])=>{sent.push([...(fields??[])]);return f.port.edit(a,r);}};
 const first=await openInventoryFormWorkspace(port);assert.ok(first);
 first.change({...first.snapshot().draft!,make:'Steinway',model:'B'},['make','model']);
 assert.equal(await first.flush(),true);first.dispose();
 const next=await openInventoryFormWorkspace(port);assert.ok(next);
 next.change({...next.snapshot().draft!,model:'D'});await next.save();
 assert.deepEqual(sent,[['make']]);next.dispose();
});
test('manual money and date components clear atomic origins and normalized unchanged labels are omitted',async()=>{
 const f=fixture();const sent:string[][]=[];
 const first=await openInventoryFormWorkspace({...f.port,edit:async(a,r,fields)=>{sent.push([...(fields??[])]);return f.port.edit(a,r);}});assert.ok(first);
 first.change({...first.snapshot().draft!,title:' Original ',make:'Steinway',asking_amount:'12,50',year:'1920',month:'1'},['title','make','asking_price','manufactured']);
 first.change({...first.snapshot().draft!,asking_currency:'EUR',day:'2'});
 await first.save();assert.deepEqual(sent,[['make']]);first.dispose();
});
