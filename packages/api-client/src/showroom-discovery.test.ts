import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createShowroomApiClient,ShowroomClientError} from './showroom.js';

for(const kind of ['valid','private','foreign','duplicate','oversized','unavailable'] as const){
 test(`discovery adapter ${kind}`,async t=>{
  const shop={id:'shop',slug:'workshop',name:'Workshop'};
  const piano={id:'piano',dealer_id:'shop',title:'Published piano'};
  const requests:string[]=[];
  const server=createServer((req,res)=>{
   requests.push(req.url!);assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);
   res.setHeader('content-type','application/json');
   if(kind==='unavailable'){res.statusCode=503;res.end(JSON.stringify({detail:'PRIVATE'}));return;}
   const directory=req.url==='/v1/showroom-discovery';
   const data:any=directory?{shops:[{...shop}]}:{shop:{...shop},pianos:[{...piano}]};
   if(kind==='private'){if(directory)data.shops[0].owner_id='PRIVATE';else data.pianos[0].serial='PRIVATE';}
   if(kind==='foreign'){if(directory)data.shops[0].slug='../private';else data.pianos[0].dealer_id='other';}
   if(kind==='duplicate'){if(directory)data.shops.push({...shop});else data.pianos.push({...piano});}
   if(kind==='oversized'){if(directory)data.shops=Array.from({length:10001},(_,i)=>({...shop,id:'s'+i,slug:'s'+i}));else data.pianos=Array.from({length:10001},(_,i)=>({...piano,id:'p'+i}));}
   res.end(JSON.stringify({data}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const api=createShowroomApiClient(`http://127.0.0.1:${address.port}`);
  if(kind==='valid'){
   assert.deepEqual(await api.directory(),[shop]);
   assert.deepEqual(await api.catalog('workshop'),{shop,pianos:[piano]});
   const count=requests.length;await assert.rejects(api.catalog('../private'));assert.equal(requests.length,count);
  }else{
   for(const run of [()=>api.directory(),()=>api.catalog('workshop')])await assert.rejects(run(),e=>e instanceof ShowroomClientError&&e.code===(kind==='unavailable'?'unavailable':'protocol_error')&&!JSON.stringify(e).includes('PRIVATE'));
  }
  assert.deepEqual(requests.slice(0,2),['/v1/showroom-discovery','/v1/showrooms/workshop/discovery']);
 });
}
