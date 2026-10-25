import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createInventoryScanApiClient} from './inventory-scan.js';
import {InventoryClientError} from './inventory.js';
const token='AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
test('scan transport keeps token in body, uses fresh credentials and validates scoped responses',async t=>{
 let credential='one',data:unknown={dealer_id:'shop',record_id:'piano',token},status=200;
 const calls:{url:string;auth:string|undefined;body:string}[]=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({url:req.url!,auth:req.headers.authorization,body});res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{data}:{code:'unavailable',detail:token}));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryScanApiClient(`http://127.0.0.1:${address.port}`,()=>credential);
 assert.deepEqual(await api.ensure('shop','piano'),{dealer_id:'shop',record_id:'piano',token});
 data={dealer_id:'shop',record_id:'piano'};credential='two';assert.deepEqual(await api.resolve('shop',token),data);
 assert.equal(calls[1]?.auth,'Bearer two');assert.equal(calls[1]?.url,'/v1/dealers/shop/inventory/scan/resolve');assert.deepEqual(JSON.parse(calls[1]!.body),{token});assert.ok(calls.every(c=>!c.url.includes(token)));
 for(const bad of [{dealer_id:'foreign',record_id:'piano'},{dealer_id:'shop',record_id:'piano',token},{dealer_id:'shop',record_id:''}]){data=bad;await assert.rejects(api.resolve('shop',token),e=>e instanceof InventoryClientError&&e.code==='protocol_error'&&!JSON.stringify(e).includes(token));}
 for(const bad of [{dealer_id:'shop',record_id:'other',token},{dealer_id:'shop',record_id:'piano',token:'A'.repeat(43)},{dealer_id:'shop',record_id:'piano',token,private_notes:'private'}]){data=bad;await assert.rejects(api.ensure('shop','piano'),e=>e instanceof InventoryClientError&&e.code==='protocol_error');}
 const before=calls.length;await assert.rejects(api.resolve('shop','invalid'));await assert.rejects(api.ensure('shop/other','piano'));assert.equal(calls.length,before);
 status=503;await assert.rejects(api.resolve('shop',token),e=>e instanceof InventoryClientError&&e.status===503&&!JSON.stringify(e).includes(token));
});
