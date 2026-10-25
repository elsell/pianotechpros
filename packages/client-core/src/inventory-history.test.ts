import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryHistory} from './inventory-history.js';
test('history keeps one page, retries older operation, clears on denial and ignores disposal races',async()=>{
 let fail=false,denied=false;const calls:(string|undefined)[]=[];
 const model=createInventoryHistory<{revision:number;fields:string[]}>({list:async cursor=>{calls.push(cursor);if(denied)throw 'denied';if(fail)throw 'unavailable';return cursor?{items:[{revision:1,fields:[]}]}:{items:[{revision:2,fields:['make']}],nextCursor:'older'};},classify:error=>error==='denied'?'denied':'unavailable'});
 await model.latest();assert.equal(model.snapshot().items[0]?.revision,2);
 model.snapshot().items[0]!.fields.push('private_notes');assert.deepEqual(model.snapshot().items[0]?.fields,['make']);
 fail=true;await model.older();assert.equal(model.snapshot().items[0]?.revision,2);assert.equal(model.snapshot().issue,'unavailable');
 fail=false;await model.retry();assert.equal(calls.at(-1),'older');assert.deepEqual(model.snapshot().items.map(x=>x.revision),[1]);
 denied=true;await model.latest();assert.deepEqual(model.snapshot().items,[]);assert.equal(model.snapshot().issue,'denied');
 let finish!:(value:{items:{revision:number}[]})=>void;let signal:AbortSignal|undefined;
 const pending=createInventoryHistory({list:(_cursor,s)=>{signal=s;return new Promise<{items:{revision:number}[]}>(resolve=>finish=resolve);},classify:()=> 'unavailable'});
 const work=pending.latest();pending.dispose();assert.equal(signal?.aborted,true);finish({items:[{revision:1}]});await work;assert.deepEqual(pending.snapshot().items,[]);
});
test('history rejects backwards/cyclic pagination without replacing current entries',async()=>{
 const model=createInventoryHistory({list:async cursor=>cursor?{items:[{revision:3}],nextCursor:'other'}:{items:[{revision:2}],nextCursor:'older'},classify:()=> 'unavailable'});
 await model.latest();await model.older();assert.equal(model.snapshot().issue,'protocol_error');assert.equal(model.snapshot().items[0]?.revision,2);
});

test('history works without the structuredClone global on native runtimes',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'structuredClone');
 Object.defineProperty(globalThis,'structuredClone',{value:undefined,configurable:true,writable:true});
 try{
  const item={revision:2,fields:['make'],fieldSources:{make:'voice'},salePrice:{amountMinor:1200,currency:'USD'}};
  const model=createInventoryHistory({list:async()=>({items:[item]}),classify:()=> 'unavailable'});
  const unsubscribe=model.subscribe(state=>assert.ok(Array.isArray(state.items)));
  await model.latest();
  item.fields.push('model');item.fieldSources.make='manual';item.salePrice.amountMinor=0;
  const snapshot=model.snapshot();assert.deepEqual(snapshot.items[0]?.fields,['make']);
  assert.equal(snapshot.items[0]?.fieldSources.make,'voice');assert.equal(snapshot.items[0]?.salePrice.amountMinor,1200);
  snapshot.items[0]!.salePrice.amountMinor=1;assert.equal(model.snapshot().items[0]?.salePrice.amountMinor,1200);
  unsubscribe();model.dispose();assert.deepEqual(model.snapshot().items,[]);
 }finally{if(descriptor)Object.defineProperty(globalThis,'structuredClone',descriptor);else Reflect.deleteProperty(globalThis,'structuredClone');}
});
