import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryBrowser } from './inventory-browser';
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
type Row={id:string;title:string};
const copy=(r:Row)=>({...r});
test('filter changes suppress old replies and never display mismatched results',async()=>{
 const old=deferred<{items:Row[];nextCursor?:string}>();let calls=0;
 const b=createInventoryBrowser({copy,accessDenied:(e:unknown)=>e==='denied',list:async()=>++calls===1?old.promise:{items:[{id:'new',title:'New'}]}});
 const loading=b.refresh();const changing=b.filter({search:'new',status:'all'});assert.equal(b.snapshot().items.length,0);await changing;old.resolve({items:[{id:'old',title:'Old'}]});await loading;assert.equal(b.snapshot().items[0]?.id,'new');
});
test('pagination coalesces, preserves rows on outages, retries and clears on denial',async()=>{
 let calls=0;let failure:unknown=null;const more=deferred<{items:Row[];nextCursor?:string}>();
 const b=createInventoryBrowser({copy,accessDenied:(e:unknown)=>e==='denied',list:async(_filters,cursor)=>{calls++;if(failure)throw failure;return cursor?more.promise:{items:[{id:'one',title:'First'}],nextCursor:'next'};}});
 await b.refresh();const first=b.more();const second=b.more();assert.equal(calls,2);more.resolve({items:[{id:'two',title:'Second'}]});await Promise.all([first,second]);assert.equal(b.snapshot().items.length,2);
 failure='network';await b.refresh();assert.equal(b.snapshot().items.length,2);assert.equal(b.snapshot().failed,'refresh');assert.equal(b.snapshot().denied,false);failure='denied';await b.retry();assert.equal(b.snapshot().items.length,0);assert.equal(b.snapshot().denied,true);assert.equal(b.snapshot().nextCursor,undefined);
});
test('disposal clears private rows and snapshots cannot mutate controller state',async()=>{
 const pending=deferred<{items:Row[]}>();let calls=0;const b=createInventoryBrowser({copy,accessDenied:()=>false,list:async()=>++calls===1?{items:[{id:'one',title:'private'}]}:pending.promise});
 await b.refresh();b.snapshot().items[0]!.title='changed';assert.equal(b.snapshot().items[0]?.title,'private');const loading=b.refresh();b.dispose();assert.equal(b.snapshot().items.length,0);pending.resolve({items:[{id:'late',title:'private'}]});await loading;assert.equal(b.snapshot().items.length,0);
});

test('a failed continuation retries the same cursor and fresh filters discard it',async()=>{
 const cursors:(string|undefined)[]=[];let fail=true;
 const b=createInventoryBrowser({copy,accessDenied:()=>false,list:async(_filters,cursor)=>{cursors.push(cursor);if(cursor&&fail)throw Error('offline');return cursor?{items:[{id:'two',title:'Second'}]}:{items:[{id:'one',title:'First'}],nextCursor:'next'};}});
 await b.refresh();await b.more();assert.equal(b.snapshot().failed,'more');assert.equal(b.snapshot().items.length,1);assert.equal(b.snapshot().nextCursor,'next');fail=false;await b.retry();assert.deepEqual(cursors,[undefined,'next','next']);assert.equal(b.snapshot().items.length,2);
 await b.filter({search:'different',status:'sold'});assert.equal(cursors.at(-1),undefined);assert.equal(b.snapshot().items.length,1);
});

test('confirmed denial survives pending and transient retries until current success',async()=>{
 let deny=true;let response=deferred<{items:Row[]}>();
 const b=createInventoryBrowser({copy,accessDenied:(e:unknown)=>e==='denied',list:async()=>{if(deny)throw 'denied';return response.promise;}});
 await b.refresh();assert.equal(b.snapshot().denied,true);deny=false;
 const retry=b.retry();assert.equal(b.snapshot().busy,true);assert.equal(b.snapshot().denied,true);
 response.reject('network');await retry;assert.equal(b.snapshot().denied,true);assert.equal(b.snapshot().items.length,0);
 response=deferred<{items:Row[]}>();const filtering=b.filter({search:'restored',status:'all'});assert.equal(b.snapshot().denied,true);
 response.resolve({items:[{id:'restored',title:'Restored'}]});await filtering;assert.equal(b.snapshot().denied,false);assert.equal(b.snapshot().items[0]?.id,'restored');
});

test('a stale successful response cannot clear a newer access denial',async()=>{
 const old=deferred<{items:Row[]}>();let calls=0;
 const b=createInventoryBrowser({copy,accessDenied:(e:unknown)=>e==='denied',list:async()=>{if(++calls===1)return old.promise;throw 'denied';}});
 const stale=b.refresh();await b.refresh();old.resolve({items:[{id:'private',title:'Private'}]});await stale;
 assert.equal(b.snapshot().denied,true);assert.equal(b.snapshot().items.length,0);
});
