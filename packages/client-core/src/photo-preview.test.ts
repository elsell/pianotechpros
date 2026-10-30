import test from 'node:test';
import assert from 'node:assert/strict';
import {photoPreviewURI} from './photo-preview';
test('private preview bytes encode losslessly including chunk boundaries and padding',()=>{
 for(const size of [4,5,6,7,8191,8192,8193,65537]){
  const bytes=new Uint8Array(size);for(let i=0;i<size;i++)bytes[i]=i%256;
  bytes.set([255,216]);bytes.set([255,217],size-2);
  const uri=photoPreviewURI(bytes);assert.ok(uri.startsWith('data:image/jpeg;base64,'));
  assert.deepEqual(Buffer.from(uri.split(',')[1],'base64'),Buffer.from(bytes));
 }
});
test('private preview rejects invalid or oversized image data',()=>{
 for(const bytes of [new Uint8Array(),new Uint8Array([1,2,3,4]),new Uint8Array(20*1024*1024+1)])assert.throws(()=>photoPreviewURI(bytes));
});
test('validated public ArrayBuffer photos use the same bounded preview encoding',()=>{
 const bytes=new Uint8Array([255,216,1,2,255,217]);
 assert.equal(photoPreviewURI(bytes.buffer),photoPreviewURI(bytes));
 assert.throws(()=>photoPreviewURI(new ArrayBuffer(20*1024*1024+1)));
});
