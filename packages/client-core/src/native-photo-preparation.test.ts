import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativePhoto, type NativePhotoPreparationPort} from './native-photo-preparation';

function fixture() {
 const calls:string[]=[];
 let active=true;
 const source={width:8000,height:6000};
 const rendered={width:4096,height:3072};
 const bytes=new Uint8Array([255,216,255,224,0,2,255,217]);
 const port:NativePhotoPreparationPort<typeof source,typeof rendered>={
  active:()=>active,
  inspect:async()=>{calls.push('inspect');return {...source,size:12*1024*1024};},
  render:async(_source,size)=>{calls.push('render');assert.deepEqual(size,{width:4096,height:3072});return rendered;},
  inspectRendered:async()=>{calls.push('inspectRendered');return {...rendered,size:bytes.length};},
  read:async(_rendered,limit)=>{calls.push('read');assert.equal(limit,20*1024*1024);return bytes;},
  release:async(_source,output)=>{calls.push(output?'releaseBoth':'releaseSource');},
 };
 return {port,source,rendered,bytes,calls,invalidate:()=>{active=false;}};
}

test('normalizes a large still image and releases temporary resources before returning copied bytes',async()=>{
 const f=fixture();const result=await prepareNativePhoto(f.source,f.port);
 assert.deepEqual(result,f.bytes);f.bytes.fill(0);assert.equal(result[0],255);
 assert.deepEqual(f.calls,['inspect','render','inspectRendered','read','releaseBoth']);
});
test('rejects oversized or invalid source metadata before decoding and still cleans up',async()=>{
 for(const metadata of [{width:0,height:1,size:4},{width:1.5,height:2,size:4},{width:12001,height:1,size:4},{width:10000,height:10000,size:4},{width:10,height:10,size:50*1024*1024+1},{width:10,height:10,size:NaN}]){
  const f=fixture();f.port.inspect=async()=>metadata;
  await assert.rejects(prepareNativePhoto(f.source,f.port),{message:'native_photo_invalid'});
  assert.deepEqual(f.calls,['releaseSource']);
 }
});
test('rejects a renderer that violates the requested size or JPEG contract',async()=>{
 for(const kind of ['dimensions','size','signature','length']){
  const f=fixture();
  if(kind==='dimensions')f.port.inspectRendered=async()=>({width:4097,height:3072,size:8});
  if(kind==='size')f.port.inspectRendered=async()=>({width:4096,height:3072,size:20*1024*1024+1});
  if(kind==='signature')f.bytes[0]=0;
  if(kind==='length')f.port.read=async()=>new Uint8Array([255,216,255]);
  await assert.rejects(prepareNativePhoto(f.source,f.port),{message:'native_photo_invalid'});
  assert.equal(f.calls.at(-1),'releaseBoth');
 }
});
test('scope loss at every asynchronous boundary prevents disclosure and releases owned files',async()=>{
 for(const boundary of ['inspect','render','inspectRendered','read','release'] as const){
  const f=fixture();const original=f.port[boundary];
  // Each controlled fake retains the real port behavior, then changes account scope.
  f.port[boundary]=(async(...args:never[])=>{const result=await (original as (...args:never[])=>Promise<unknown>)(...args);f.invalidate();return result;}) as never;
  await assert.rejects(prepareNativePhoto(f.source,f.port),{message:'native_photo_inactive'});
  assert.match(f.calls.at(-1)!,/^release/);
 }
});
test('conversion and cleanup errors are sanitized and never expose local paths',async()=>{
 for(const boundary of ['inspect','render','read','release'] as const){
  const f=fixture();f.port[boundary]=(async()=>{throw new Error('file:///private/photo-person.jpg');}) as never;
  await assert.rejects(prepareNativePhoto(f.source,f.port),{message:'native_photo_unavailable'});
  if(boundary!=='release')assert.match(f.calls.at(-1)!,/^release/);
 }
});
test('already inactive selection is cleaned without reading or decoding',async()=>{
 const f=fixture();f.invalidate();await assert.rejects(prepareNativePhoto(f.source,f.port),{message:'native_photo_inactive'});
 assert.deepEqual(f.calls,['releaseSource']);
});
