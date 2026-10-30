import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicResource} from './public-resource';
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
test('public refresh hides old content and never restores it on failure',async()=>{
 let fail=false;const r=createPublicResource(async()=>{if(fail)throw Error('private');return {name:'Published'};});
 await r.refresh();const copy=r.snapshot();copy.value!.name='changed';assert.equal(r.snapshot().value?.name,'Published');
 fail=true;const pending=r.refresh();assert.equal(r.snapshot().value,null);await pending;assert.equal(r.snapshot().failure,true);assert.equal(r.snapshot().value,null);
});
test('new request and route loss abort and suppress late public responses',async()=>{
 const calls:{signal:AbortSignal;gate:ReturnType<typeof deferred<string>>}[]=[];
 const r=createPublicResource(signal=>{const gate=deferred<string>();calls.push({signal,gate});return gate.promise;});
 const a=r.refresh(),b=r.refresh();assert.equal(calls[0]!.signal.aborted,true);calls[1]!.gate.resolve('new');await b;calls[0]!.gate.resolve('old');await a;assert.equal(r.snapshot().value,'new');
 const c=r.refresh();r.clear();assert.equal(calls[2]!.signal.aborted,true);calls[2]!.gate.resolve('late');await c;assert.equal(r.snapshot().value,null);
 r.dispose();await r.refresh();assert.equal(calls.length,3);
});
test('observer cancellation suppresses provider dispatch',async()=>{
 let calls=0;const r=createPublicResource(async()=>{calls++;return 'public';});r.subscribe(s=>{if(s.loading)r.clear();});await r.refresh();assert.equal(calls,0);
});
test('disposing cannot let an observer restart a public request',async()=>{
 let calls=0;const r=createPublicResource(async()=>{calls++;return 'public';});await r.refresh();
 r.subscribe(s=>{if(s.value===null&&!s.loading)void r.refresh();});r.dispose();assert.equal(calls,1);
});
