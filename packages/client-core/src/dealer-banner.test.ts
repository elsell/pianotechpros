import assert from 'node:assert/strict';
import test from 'node:test';
import {createDealerBanner} from './dealer-banner.js';
const initial={profile:{id:'shop',revision:1,name:'Shop'},banner:null as null|{id:string;width:number;height:number}};
function fixture(){
 let stored=structuredClone(initial),calls=0,fail:unknown=null,keys=0;
 const uploads:Array<{bytes:number[];key:string;revision:number}>=[];
 const c=createDealerBanner({
 dealerID:'shop',initial, key:()=>`key-${++keys}`,
 load:async()=>structuredClone(stored),
 upload:async(bytes:Uint8Array,key:string,revision:number)=>{
 uploads.push({bytes:[...bytes],key,revision});calls++;
 if(fail)throw fail;
 if(revision!==stored.profile.revision)throw 'conflict';
 stored={profile:{...stored.profile,revision:revision+1},banner:{id:'new',width:10,height:5}};
 return {...structuredClone(stored),bannerID:'new',replay:false};
 },
 remove:async(revision:number)=>{calls++;if(fail)throw fail;assert.equal(revision,stored.profile.revision);stored={profile:{...stored.profile,revision:revision+1},banner:null};return structuredClone(stored);},
 denied:(e:unknown)=>e==='denied',conflict:(e:unknown)=>e==='conflict',
 rejected:(e:unknown)=>e==='invalid',
 });
 return {c,uploads,calls:()=>calls,fail:(e:unknown)=>{fail=e;},stored:()=>stored,change:(s:typeof stored)=>{stored=structuredClone(s);}};
}
test('selection is private until confirmation and copies bytes',async()=>{
 const f=fixture();const source=new Uint8Array([1,2,3]);
 f.c.select(source);source[0]=99;assert.equal(f.calls(),0);assert.equal(f.c.snapshot().phase,'upload-review');
 f.c.cancel();assert.equal(f.calls(),0);assert.equal(f.c.snapshot().hasSelection,false);
 f.c.select(new Uint8Array([4,5]));await f.c.confirmUpload();
 assert.deepEqual(f.uploads[0].bytes,[4,5]);assert.equal(f.c.snapshot().notice,'uploaded');assert.equal(f.c.snapshot().current?.profile.revision,2);
});
test('uncertain upload keeps exact intent and refuses different selection',async()=>{
 const f=fixture();f.c.select(new Uint8Array([1,2]));f.fail('network');await f.c.confirmUpload();
 assert.equal(f.c.snapshot().phase,'upload-uncertain');assert.equal(f.c.select(new Uint8Array([9])),false);
 f.fail(null);await f.c.confirmUpload();assert.deepEqual(f.uploads[0],f.uploads[1]);assert.equal(f.c.snapshot().hasSelection,false);
});
test('conflict requires refresh then explicit review with new key and revision',async()=>{
 const f=fixture();f.c.select(new Uint8Array([3]));f.change({profile:{...initial.profile,revision:2},banner:null});
 await f.c.confirmUpload();assert.equal(f.c.snapshot().phase,'refresh-required');await f.c.confirmUpload();assert.equal(f.calls(),1);
 await f.c.refresh();assert.equal(f.c.snapshot().phase,'upload-review');assert.equal(f.calls(),1);
 await f.c.confirmUpload();assert.equal(f.uploads[1].revision,2);assert.notEqual(f.uploads[1].key,f.uploads[0].key);
});
test('uncertain removal never automatically retries',async()=>{
 const f=fixture();f.c.select(new Uint8Array([1]));await f.c.confirmUpload();
 assert.equal(f.c.reviewRemoval(),true);f.fail('network');await f.c.confirmRemoval();const count=f.calls();
 assert.equal(f.c.snapshot().phase,'refresh-required');await f.c.confirmRemoval();assert.equal(f.calls(),count);
 f.fail(null);await f.c.refresh();assert.equal(f.c.snapshot().phase,'idle');assert.equal(f.calls(),count);
 f.c.reviewRemoval();await f.c.confirmRemoval();assert.equal(f.c.snapshot().notice,'removed');assert.equal(f.c.snapshot().current?.banner,null);
});
test('access denial clears private selection and current image',async()=>{
 const f=fixture();f.c.select(new Uint8Array([1]));f.fail('denied');await f.c.confirmUpload();
 assert.equal(f.c.snapshot().current,null);assert.equal(f.c.snapshot().hasSelection,false);assert.equal(f.c.snapshot().denied,true);
});
test('dispose aborts and suppresses late results',async()=>{
 let resolve!:(value:any)=>void;let signal:AbortSignal|undefined;
 const c=createDealerBanner({dealerID:'shop',initial,key:()=>'key',load:async()=>initial,
 upload:(_bytes,key,revision,s)=>{signal=s;return new Promise(r=>resolve=r);},remove:async()=>initial,
 denied:()=>false,conflict:()=>false,rejected:()=>false});
 c.select(new Uint8Array([1]));const pending=c.confirmUpload();c.dispose();assert.equal(signal?.aborted,true);
 resolve({...initial,bannerID:'old',replay:true});await pending;assert.equal(c.snapshot().current,null);assert.equal(c.snapshot().hasSelection,false);
});
test('replay acknowledges a superseded image without restoring it',async()=>{
 const c=createDealerBanner({dealerID:'shop',initial,key:()=>'key',load:async()=>initial,
 upload:async()=>({profile:{...initial.profile,revision:3},banner:null,bannerID:'old',replay:true}),remove:async()=>initial,
 denied:()=>false,conflict:()=>false,rejected:()=>false});
 c.select(new Uint8Array([1]));await c.confirmUpload();assert.equal(c.snapshot().notice,'superseded');assert.equal(c.snapshot().current?.banner,null);
});
for(const operation of ['refresh','upload','remove'] as const){
 for(const cancel of ['interrupt','dispose'] as const){
 test(`observer ${cancel} prevents ${operation} dispatch`,async()=>{
 let calls=0;
 const c=createDealerBanner({dealerID:'shop',initial:{...initial,banner:{id:'existing',width:10,height:5}},key:()=>'key',
 load:async()=>{calls++;return initial;},upload:async()=>{calls++;return {...initial,bannerID:'new',replay:true};},remove:async()=>{calls++;return initial;},
 denied:()=>false,conflict:()=>false,rejected:()=>false});
 if(operation==='upload')c.select(new Uint8Array([1]));
 if(operation==='remove')c.reviewRemoval();
 c.subscribe(s=>{if(s.busy)c[cancel]();});
 await (operation==='refresh'?c.refresh():operation==='upload'?c.confirmUpload():c.confirmRemoval());
 assert.equal(calls,0);
 });
 }
}
test('reentrant key generation cannot dispatch after disposal',async()=>{
 let calls=0;
 const c=createDealerBanner({dealerID:'shop',initial,key:()=>{c.dispose();return 'key';},load:async()=>initial,
 upload:async()=>{calls++;return {...initial,bannerID:'new',replay:true};},remove:async()=>initial,
 denied:()=>false,conflict:()=>false,rejected:()=>false});
 c.select(new Uint8Array([1]));await c.confirmUpload();assert.equal(calls,0);assert.equal(c.snapshot().hasSelection,false);
});
test('banner preview recognizes only supported raster headers',async()=>{
 const {bannerMediaType}=await import('./dealer-banner.js');
 assert.equal(bannerMediaType(new Uint8Array([255,216,255])),'image/jpeg');
 assert.equal(bannerMediaType(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(bannerMediaType(new TextEncoder().encode('RIFF1234WEBP')),'image/webp');
 assert.equal(bannerMediaType(new TextEncoder().encode('<svg>')),null);
});
