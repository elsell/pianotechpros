import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePhotoPicker,type NativePickerAsset,type NativePickerResult} from './native-photo-picker';
const asset:NativePickerAsset={uri:'file:///cache/owned.jpg',width:80,height:60};
function fixture(){
 const rows=new Map<string,string>();const calls:string[]=[];let active=true;let held=false;let pending:NativePickerResult|null=null;let targetID='capture-original';let authorized=true;let owner:string|null=null;
 const port={owner:{read:async()=>owner,write:async(value:string|null)=>{owner=value;}},scope:{userID:'user',dealerID:'dealer',targetID},active:()=>active,now:()=>1000,key:()=> 'picker-intent-0001',
  authorize:async()=>{calls.push('authorize');if(!authorized)throw new Error('secret');},
  lease:async()=>{if(held)throw new Error('busy');held=true;return()=>{held=false;};},
  storage:async()=>({read:async(key:string)=>rows.get(key)??null,write:async(key:string,value:string)=>{rows.set(key,value);},remove:async(key:string)=>{rows.delete(key);}}),
  pending:async()=>{calls.push('pending');const value=pending;pending=null;return value;},
  launch:async(_source:'camera'|'library'):Promise<NativePickerResult>=>{calls.push('launch');assert.equal(rows.size,1);return {kind:'selected',asset};},
  discard:async(_asset:NativePickerAsset)=>{calls.push('discard');},
  accept:async(_asset:NativePickerAsset)=>{calls.push('accept');},
 };
 return {port,rows,calls,open:()=>createNativePhotoPicker(port),invalidate:()=>{active=false;},deny:()=>{authorized=false;},pending:(value:NativePickerResult)=>{pending=value;}};
}
test('persists scope before launch, restores without accepting, then explicitly consumes once',async()=>{
 const f=fixture();const picker=f.open();const selected=await picker.select('camera');
 assert.deepEqual(selected,{status:'selected',id:'picker-intent-0001'});
 assert.deepEqual(await f.open().restore(),selected);assert.equal(f.calls.includes('accept'),false);
 await picker.consume(selected.id!);assert.equal(f.rows.size,0);assert.equal(f.calls.filter(c=>c==='accept').length,1);
 await assert.rejects(picker.consume(selected.id!));assert.equal(f.calls.filter(c=>c==='accept').length,1);
});
test('another target cannot consume a pending result or launch a second picker',async()=>{
 const f=fixture();await f.open().select('library');f.port.scope={...f.port.scope,targetID:'different'};f.calls.length=0;
 await assert.rejects(f.open().restore(),{message:'native_picker_other_target'});
 await assert.rejects(f.open().select('camera'),{message:'native_picker_other_target'});
 assert.equal(f.calls.includes('pending'),false);assert.equal(f.calls.includes('launch'),false);
});
test('restores a matching waiting system result without dispatching an upload',async()=>{
 const f=fixture();f.port.launch=async()=>{throw new Error('activity destroyed');};await assert.rejects(f.open().select('camera'));
 f.pending({kind:'selected',asset});assert.equal((await f.open().restore()).status,'selected');assert.equal(f.calls.includes('accept'),false);
});
test('lost consumption acknowledgement restores uncertain and never repeats accept',async()=>{
 const f=fixture();const picker=f.open();const state=await picker.select('library');let accepted=0;
 f.port.accept=async()=>{accepted++;throw new Error('lost response');};await assert.rejects(picker.consume(state.id!));
 assert.equal((await f.open().restore()).status,'uncertain');await assert.rejects(picker.consume(state.id!));assert.equal(accepted,1);
 await picker.discard();assert.equal(f.rows.size,0);assert.equal(accepted,1);
});
test('denial precedes protected-storage access and scope loss cleans a late system result',async()=>{
 const f=fixture();f.deny();await assert.rejects(f.open().select('camera'));assert.equal(f.rows.size,0);assert.deepEqual(f.calls,['authorize']);
 const g=fixture();g.port.launch=async()=>{g.invalidate();return {kind:'selected',asset};};await assert.rejects(g.open().select('camera'));
 assert.equal(g.calls.includes('discard'),true);assert.equal(g.calls.includes('accept'),false);
});
test('drains orphaned results before a fresh intent and cancellation preserves unrelated storage',async()=>{
 const f=fixture();f.rows.set('text-draft','protected');f.pending({kind:'selected',asset});
 f.port.launch=async()=>({kind:'cancelled'});assert.equal((await f.open().select('library')).status,'idle');
 assert.deepEqual([...f.rows],[['text-draft','protected']]);assert.ok(f.calls.indexOf('discard')>f.calls.indexOf('pending'));
});
test('failed cleanup retains encrypted intent and a later discard retries cleanup',async()=>{
 const f=fixture();await f.open().select('camera');f.port.discard=async()=>{throw new Error('file:///secret');};
 await assert.rejects(f.open().discard(),{message:'native_picker_unavailable'});assert.equal(f.rows.size,1);
 f.port.discard=async()=>{};await f.open().discard();assert.equal(f.rows.size,0);
});
test('expired intent cannot consume and malformed persisted descriptors fail closed',async()=>{
 const f=fixture();const selected=await f.open().select('camera');f.port.now=()=>1000+7*24*60*60*1000;
 assert.equal((await f.open().restore()).status,'expired');await assert.rejects(f.open().consume(selected.id!));assert.equal(f.calls.includes('accept'),false);
 const key=[...f.rows.keys()][0];f.rows.set(key,'{"version":1,"asset":{"uri":"https://private.invalid"}}');
 await assert.rejects(f.open().restore());assert.equal(f.calls.includes('accept'),false);
});
test('failed durable reservation prevents opening the camera',async()=>{
 const f=fixture();f.port.storage=async()=>({read:async()=>null,write:async()=>{throw new Error('storage');},remove:async()=>{}});
 await assert.rejects(f.open().select('camera'));assert.equal(f.calls.includes('launch'),false);
});
test('oversized system result is cleaned without accepting or saving its descriptor',async()=>{
 const f=fixture();f.port.launch=async()=>({kind:'selected',asset:{...asset,width:12001}});
 await assert.rejects(f.open().select('camera'));assert.equal(f.calls.includes('discard'),true);
 assert.equal(f.calls.includes('accept'),false);assert.equal((await f.open().restore()).status,'waiting');
});
test('expiry during durable processing mark suppresses acceptance',async()=>{
 const f=fixture();const selected=await f.open().select('library');const storage=await f.port.storage();
 f.port.storage=async()=>({...storage,write:async(key,value)=>{await storage.write(key,value);f.port.now=()=>1000+7*24*60*60*1000;}});
 await assert.rejects(f.open().consume(selected.id!));assert.equal(f.calls.includes('accept'),false);
});
test('global lease prevents concurrent picker launches and drains after cancellation',async()=>{
 const f=fixture();let resume!:(result:NativePickerResult)=>void;let opened!:()=>void;
 const waiting=new Promise<void>(resolve=>{opened=resolve;});
 f.port.launch=async()=>{opened();return new Promise(resolve=>{resume=resolve;});};
 const first=f.open().select('camera');await waiting;
 await assert.rejects(f.open().select('library'));resume({kind:'cancelled'});assert.equal((await first).status,'idle');
 assert.equal((await f.open().restore()).status,'idle');
});

test('an older account cannot attach or discard a newer account’s globally pending result',async()=>{
 const a=fixture();const b=fixture();b.port.scope={userID:'other-user',dealerID:'other-dealer',targetID:'other-target'};b.port.key=()=> 'picker-intent-0002';
 b.port.owner=a.port.owner;
 a.port.launch=async()=>{throw new Error('interrupted');};b.port.launch=a.port.launch;
 await assert.rejects(a.open().select('camera'));await assert.rejects(b.open().select('camera'));
 let pending:NativePickerResult|null={kind:'selected',asset};let reads=0;
 const read=async()=>{reads++;const result=pending;pending=null;return result;};a.port.pending=read;b.port.pending=read;
 assert.equal((await a.open().restore()).status,'uncertain');assert.equal(reads,0);
 await a.open().discard();assert.equal(reads,0);assert.equal(pending?.kind,'selected');
 assert.equal((await b.open().restore()).status,'selected');assert.equal(reads,1);
 assert.equal(a.calls.includes('accept'),false);
});
test('a failed global ownership write never launches the picker',async()=>{
 const f=fixture();f.port.owner.write=async()=>{throw new Error('secure storage');};await assert.rejects(f.open().select('camera'));
 assert.equal(f.calls.includes('launch'),false);assert.equal((await f.open().restore()).status,'uncertain');
});
test('camera denial is distinct from cancellation and clears only its own intent',async()=>{
 const f=fixture();f.port.launch=async()=>({kind:'denied'});assert.deepEqual(await f.open().select('camera'),{status:'denied'});
 assert.equal(f.rows.size,0);assert.equal(await f.port.owner.read(),null);assert.equal(f.calls.includes('accept'),false);
});

test('qualified maximum-length capture and record identities survive picker restoration',async()=>{
 for(const prefix of ['capture/','record/']){
  const f=fixture();f.port.scope.targetID=prefix+'x'.repeat(128);
  const selected=await f.open().select('library');assert.deepEqual(await f.open().restore(),selected);
  await f.open().consume(selected.id!);assert.equal(f.calls.filter(c=>c==='accept').length,1);
 }
});
test('scope bounds and exact fields are validated at construction and restoration',async()=>{
 for(const scope of [
  {userID:'x'.repeat(129),dealerID:'dealer',targetID:'target'},
  {userID:'user',dealerID:'x'.repeat(129),targetID:'target'},
  {userID:'user',dealerID:'dealer',targetID:'x'.repeat(161)},
  {userID:'user',dealerID:'dealer',targetID:'target',extra:'value'},
  {userID:'user',dealerID:'dealer'},
  {userID:'user',dealerID:'dealer',targetID:'bad\nvalue'},
 ]){
  const f=fixture();assert.throws(()=>createNativePhotoPicker({...f.port,scope:scope as typeof f.port.scope}),{message:'native_picker_unavailable'});
  await f.open().select('library');const key=[...f.rows.keys()][0];const row=JSON.parse(f.rows.get(key)!);row.scope=scope;f.rows.set(key,JSON.stringify(row));f.calls.length=0;
  await assert.rejects(f.open().restore(),{message:'native_picker_unavailable'});assert.equal(f.calls.includes('pending'),false);assert.equal(f.calls.includes('accept'),false);
 }
});
