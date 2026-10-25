import test from 'node:test';
import assert from 'node:assert/strict';
import decodeQR from 'qr/decode.js';
import {inventoryScanMatrix} from './inventory-scan-qr.js';
import {createInventoryScanLink} from './inventory-scan-link.js';
const token='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
test('scan matrix has a quiet zone and decodes to the canonical private link without native TextEncoder',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'TextEncoder');
 Object.defineProperty(globalThis,'TextEncoder',{value:undefined,configurable:true,writable:true});
 let matrix:boolean[][];
 try{matrix=inventoryScanMatrix('https://piano.example','shop',token);}finally{if(descriptor)Object.defineProperty(globalThis,'TextEncoder',descriptor);else Reflect.deleteProperty(globalThis,'TextEncoder');}
 assert.ok(matrix.length>21);assert.ok(matrix.every(row=>row.length===matrix.length));
 for(let i=0;i<4;i++){assert.ok(matrix[i]!.every(x=>!x));assert.ok(matrix.at(-i-1)!.every(x=>!x));assert.ok(matrix.every(row=>!row[i]&&!row.at(-i-1)));}
 const scale=5,width=matrix.length*scale,data=new Uint8Array(width*width*4);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){const index=(y*width+x)*4,color=matrix[Math.floor(y/scale)]![Math.floor(x/scale)]?0:255;data[index]=color;data[index+1]=color;data[index+2]=color;data[index+3]=255;}
 assert.equal(decodeQR({width,height:width,data}),createInventoryScanLink('https://piano.example','shop',token));
 assert.throws(()=>inventoryScanMatrix('https://foreign.example/path','shop',token));
});
