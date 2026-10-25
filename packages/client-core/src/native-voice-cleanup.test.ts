import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeVoiceCapture} from './native-voice-capture';
import {createNativeVoiceCleanup} from './native-voice-cleanup';
test('retired recorder preserves failed disposal and recovers before remounted acquisition',async()=>{
 const cleanup=createNativeVoiceCleanup();let fail=true,disposals=0,permissions=0;
 const old=createNativeVoiceCapture({active:()=>true,permission:async()=>true,prepare:async()=>({record:()=>{},stop:async()=>{},read:async()=>new Uint8Array([1]),dispose:async()=>{disposals++;if(fail)throw Error('private');}}),changed:()=>{},completed:()=>{}});
 await old.start();await cleanup.retire(old);assert.equal(old.snapshot().busy,true);
 const next=createNativeVoiceCapture({active:()=>true,recover:()=>cleanup.retry(),permission:async()=>{permissions++;return true;},prepare:async()=>({record:()=>{},stop:async()=>{},read:async()=>new Uint8Array([1]),dispose:async()=>{}}),changed:()=>{},completed:()=>{}});
 await next.start();assert.equal(next.snapshot().issue,'cleanup');assert.equal(permissions,0);assert.equal(disposals,2);
 fail=false;await next.retryCleanup();assert.equal(permissions,0);assert.equal(next.snapshot().issue,null);await next.start();assert.equal(permissions,1);assert.equal(next.snapshot().phase,'recording');assert.equal(disposals,3);
 await cleanup.retry();assert.equal(disposals,3);await next.dispose();
});
test('retirement attempts are serialized per owner and new retired owners are not lost',async()=>{
 const registry=createNativeVoiceCleanup();let resolve!:()=>void,firstCalls=0,secondCalls=0;
 const pending=new Promise<void>(r=>resolve=r);const first={dispose:async()=>{firstCalls++;await pending;},snapshot:()=>({busy:false})};
 const one=registry.retire(first),retry=registry.retry();const two=registry.retire({dispose:async()=>{secondCalls++;},snapshot:()=>({busy:false})});await two;
 assert.equal(firstCalls,1);assert.equal(secondCalls,1);resolve();await one;await retry;assert.equal(await registry.retry(),true);
});
