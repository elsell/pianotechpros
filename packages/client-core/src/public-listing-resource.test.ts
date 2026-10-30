import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicListingResource} from './public-listing-resource';
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{await new Promise<void>(resolve=>setImmediate(resolve));};
test('primary listing is usable while optional related content is pending or unavailable',async()=>{
 const related=deferred<string[]>();let signal:AbortSignal|undefined;
 const view=createPublicListingResource(async()=>({id:'one'}),async(value,s)=>{assert.equal(value.id,'one');signal=s;return related.promise;});
 await view.refresh();assert.deepEqual(view.snapshot(),{value:{id:'one'},loading:false,failure:false,related:[],relatedLoading:true,relatedFailure:false});
 related.reject(Error('unavailable'));await settle();
 assert.deepEqual(view.snapshot(),{value:{id:'one'},loading:false,failure:false,related:[],relatedLoading:false,relatedFailure:true});
 assert.equal(signal?.aborted,false);view.dispose();
});
test('refresh clears old projections and suppresses late secondary responses',async()=>{
 let id=0;const calls:{signal:AbortSignal;gate:ReturnType<typeof deferred<string[]>>}[]=[];
 const view=createPublicListingResource(async()=>({id:++id}),(_,signal)=>{const gate=deferred<string[]>();calls.push({signal,gate});return gate.promise;});
 await view.refresh();const next=view.refresh();assert.equal(view.snapshot().value,null);assert.equal(calls[0]!.signal.aborted,true);
 await next;calls[0]!.gate.resolve(['stale']);await settle();assert.deepEqual(view.snapshot().related,[]);
 calls[1]!.gate.resolve(['new']);await settle();assert.deepEqual(view.snapshot().related,['new']);
 const copy=view.snapshot();copy.related.push('mutated');copy.value!.id=99;assert.equal(view.snapshot().value?.id,2);assert.deepEqual(view.snapshot().related,['new']);
 view.clear();assert.equal(view.snapshot().value,null);assert.deepEqual(view.snapshot().related,[]);
 view.dispose();await view.refresh();assert.equal(id,2);
});
test('route loss and primary failure never dispatch or retain related data',async()=>{
 const first=deferred<{id:string}>();let calls=0;
 const view=createPublicListingResource(()=>first.promise,async()=>{calls++;return ['unexpected'];});
 const pending=view.refresh();view.clear();first.resolve({id:'late'});await pending;assert.equal(calls,0);assert.equal(view.snapshot().value,null);
 const failed=createPublicListingResource(async()=>{throw Error('missing');},async()=>{calls++;return [];});
 await failed.refresh();assert.equal(failed.snapshot().failure,true);assert.equal(calls,0);
 view.dispose();failed.dispose();
});

test('malformed public route validation becomes unavailable without dispatching related requests',async()=>{
 const {publicPianoID}=await import('./showroom-url');
 for(const segment of ['', 'invalid!', '../private']){
  let relatedCalls=0;
  const view=createPublicListingResource(async()=>({id:publicPianoID(segment)}),async()=>{relatedCalls++;return [];});
  await view.refresh();assert.equal(view.snapshot().failure,true);assert.equal(view.snapshot().value,null);assert.equal(relatedCalls,0);
  view.dispose();
 }
});
test('background clear cancels pending related requests and prevents late reappearance',async()=>{
 const gate=deferred<string[]>();let signal:AbortSignal|undefined;
 const view=createPublicListingResource(async()=>({id:'one'}),(_,s)=>{signal=s;return gate.promise;});
 await view.refresh();view.clear();assert.equal(signal?.aborted,true);
 gate.resolve(['late']);await settle();assert.equal(view.snapshot().value,null);assert.deepEqual(view.snapshot().related,[]);
 view.dispose();
});
