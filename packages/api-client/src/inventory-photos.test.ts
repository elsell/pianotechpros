import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createInventoryPhotoApiClient } from './inventory-photos.js';
import { InventoryClientError } from './inventory.js';

const record = {id:'piano',dealer_id:'shop',revision:1,status:'draft',attributes:{stock_number:'PT-1'},created_at:'2026-10-22T12:00:00Z',updated_at:'2026-10-22T12:00:00Z'};
const jpeg = new Uint8Array([255,216,255,224,0,2,255,217]);
const state = () => ({record:structuredClone(record),photos:[{id:'photo',altText:'Front'}]});
test('photo transport preserves binary intent, current credentials and revisioned edits',async(t)=>{
 const seen:{method:string;url:URL;body:Buffer;token?:string;key?:string;type?:string}[]=[];
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
  seen.push({method:req.method!,url:new URL(req.url!,'http://fixture'),body:Buffer.concat(chunks),token:req.headers.authorization,key:req.headers['idempotency-key'] as string|undefined,type:req.headers['content-type']});
  if(req.url!.endsWith('/image')){res.setHeader('Content-Type','image/jpeg');res.end(jpeg);return;}
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({data:state(),...(req.method==='POST'?{meta:{photoID:'photo',replay:seen.filter(r=>r.method==='POST').length>1}}:{})}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const address=server.address();assert.ok(address&&typeof address!=='string');
 let token='first';let release!:()=>void;let gate:Promise<void>|undefined;
 const api=createInventoryPhotoApiClient(`http://127.0.0.1:${address.port}`,async()=>{await gate;return token;});
 assert.deepEqual(await api.list('shop','piano'),state());
 gate=new Promise<void>(resolve=>{release=resolve;});
 const source=jpeg.slice();const upload=api.upload('shop','piano',source,'stable-photo-key-01',1);source.fill(0);token='second';release();
 assert.equal((await upload).replay,false);
 assert.deepEqual(seen[1]?.body,Buffer.from(jpeg));assert.equal(seen[1]?.type,'application/octet-stream');assert.equal(seen[1]?.token,'Bearer second');assert.equal(seen[1]?.key,'stable-photo-key-01');assert.equal(seen[1]?.url.searchParams.get('expectedRevision'),'1');
 assert.equal((await api.upload('shop','piano',jpeg,'stable-photo-key-01',1)).replay,true);
 const ids=['photo'];gate=new Promise<void>(resolve=>{release=resolve;});
 const reorder=api.reorder('shop','piano',ids,1);ids[0]='changed';release();await reorder;
 assert.deepEqual(JSON.parse(seen.at(-1)!.body.toString()),{ids:['photo'],expectedRevision:1});
 await api.describe('shop','piano','photo','Front view',1);assert.equal(seen.at(-1)?.method,'PATCH');assert.deepEqual(JSON.parse(seen.at(-1)!.body.toString()),{altText:'Front view',expectedRevision:1});
 assert.deepEqual(await api.image('shop','piano','photo'),jpeg);
 await api.remove('shop','piano','photo',1);assert.equal(seen.at(-1)?.method,'DELETE');assert.equal(seen.at(-1)?.url.searchParams.get('expectedRevision'),'1');
 assert.ok(seen.every(r=>!r.url.toString().includes('second')));
});

for(const scenario of ['wrong-dealer','wrong-record','unsafe-revision','duplicate','too-many','bad-alt','empty-id','bad-meta','fresh-missing','detached-replay','invalid-photo','limit','denied','network','bad-json','bad-image-type','bad-image-bytes'] as const){
 test(`photo transport validates ${scenario}`,async(t)=>{
  const server=createServer((_req,res)=>{
   if(scenario==='network'){res.destroy();return;}
   res.setHeader('Content-Type','application/json');
   if(scenario==='bad-json'){res.end('PRIVATE-SENTINEL');return;}
   if(['invalid-photo','limit','denied'].includes(scenario)){res.statusCode=scenario==='limit'?413:scenario==='denied'?404:400;res.end(JSON.stringify({code:scenario==='limit'?'photo_limit_exceeded':scenario==='denied'?'not_found':'invalid_photo',detail:'PRIVATE-SENTINEL'}));return;}
   if(scenario.startsWith('bad-image')){res.setHeader('Content-Type',scenario==='bad-image-type'?'text/html':'image/jpeg');res.end(scenario==='bad-image-type'?jpeg:new Uint8Array([1,2,3]));return;}
   const value=state();let meta:unknown={photoID:'photo',replay:false};
   if(scenario==='wrong-dealer')value.record.dealer_id='other';
   if(scenario==='wrong-record')value.record.id='other';
   if(scenario==='unsafe-revision')value.record.revision=9007199254740992;
   if(scenario==='duplicate')value.photos.push({...value.photos[0]!});
   if(scenario==='too-many')value.photos=Array.from({length:51},(_,i)=>({id:String(i),altText:''}));
   if(scenario==='bad-alt')value.photos[0]!.altText='x'.repeat(241);
   if(scenario==='empty-id')value.photos[0]!.id='';
   if(scenario==='bad-meta')meta={photoID:'photo',replay:'yes'};
   if(scenario==='fresh-missing'||scenario==='detached-replay'){value.photos=[];meta={photoID:'photo',replay:scenario==='detached-replay'};}
   res.end(JSON.stringify({data:value,meta}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
  const api=createInventoryPhotoApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
  const result=scenario.startsWith('bad-image')?api.image('shop','piano','photo'):api.upload('shop','piano',jpeg,'stable-photo-key-01',1);
  if(scenario==='detached-replay'){assert.equal((await result as {replay:boolean}).replay,true);return;}
  const expected=scenario==='network'?'network':scenario==='invalid-photo'?'invalid_photo':scenario==='limit'?'photo_limit_exceeded':scenario==='denied'?'not_found':'protocol_error';
  await assert.rejects(result,(e:unknown)=>e instanceof InventoryClientError&&e.code===expected&&!JSON.stringify(e).includes('PRIVATE-SENTINEL'));
 });
}

test('local upload bounds and cancellation do not submit writes',async(t)=>{
 let requests=0;const server=createServer((_req,res)=>{requests++;res.end('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryPhotoApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
 for(const [source,code] of [[new Uint8Array(),'invalid_photo'],[new Uint8Array(20*1024*1024+1),'photo_limit_exceeded']] as const){
  await assert.rejects(api.upload('shop','piano',source,'stable-photo-key-01',1),(e:unknown)=>e instanceof InventoryClientError&&e.code===code);
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(api.upload('shop','piano',jpeg,'stable-photo-key-01',1,controller.signal),(e:unknown)=>e instanceof InventoryClientError&&e.code==='network');
 assert.equal(requests,0);
});

for(const operation of ['list','image','reorder','describe','remove','upload'] as const){
 for(const [status,code] of [[401,'unauthenticated'],[403,'forbidden'],[409,'conflict'],[429,'rate_limited'],[503,'unavailable']] as const){
  test(`photo ${operation} preserves ${code} without retry or sensitive details`,async(t)=>{
   let requests=0;const server=createServer((_req,res)=>{requests++;res.statusCode=status;res.setHeader('Content-Type','application/problem+json');res.end(JSON.stringify({code,detail:'PRIVATE-SENTINEL'}));});
   server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
   const api=createInventoryPhotoApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
   const run={
    list:()=>api.list('shop','piano'),image:()=>api.image('shop','piano','photo'),
    reorder:()=>api.reorder('shop','piano',['photo'],1),describe:()=>api.describe('shop','piano','photo','Alt',1),
    remove:()=>api.remove('shop','piano','photo',1),upload:()=>api.upload('shop','piano',jpeg,'stable-photo-key-01',1),
   }[operation];
   await assert.rejects(run(),(e:unknown)=>e instanceof InventoryClientError&&e.code===code&&e.status===status&&!JSON.stringify(e).includes('PRIVATE-SENTINEL'));
   assert.equal(requests,1);
  });
 }
}
