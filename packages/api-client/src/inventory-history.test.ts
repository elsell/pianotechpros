import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createInventoryHistoryApiClient} from './inventory-history.js';
import {InventoryClientError} from './inventory.js';
const entry={revision:2,actor_id:'actor',kind:'attributes',source:'voice',fields:['make'],field_sources:{make:'voice'},occurred_at:'2026-10-25T00:00:00Z'};
test('history transport pages through generated route with current credentials and safe errors',async t=>{
 let token='one',body:unknown={data:[entry],meta:{nextCursor:'opaque-next'}},status=200;
 const seen:{url:string;auth:string|undefined}[]=[];
 const server=createServer((req,res)=>{seen.push({url:req.url!,auth:req.headers.authorization});res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryHistoryApiClient(`http://127.0.0.1:${address.port}`,()=>token);
 assert.deepEqual((await api.list('shop','piano')).items,[entry]);token='two';await api.list('shop','piano','older');assert.equal(seen[1]?.auth,'Bearer two');assert.match(seen[1]!.url,/\/inventory\/piano\/history\?/);assert.match(seen[1]!.url,/cursor=older/);
 for(const valid of [{...entry,source:'manual',field_sources:null},{revision:3,actor_id:'actor',kind:'lifecycle',source:'manual',fields:['status','sale_price'],field_sources:null,occurred_at:entry.occurred_at,from:'available',to:'sold',sale_price:{minor_units:12345,currency:'USD'},reason:'Corrected sale\nAgreed price'},{revision:1,actor_id:'actor',kind:'created',source:'manual',fields:[],field_sources:null,occurred_at:entry.occurred_at}]){body={data:[valid],meta:{}};assert.deepEqual((await api.list('shop','piano')).items,[valid]);}
 for(const malformed of [{...entry,revision:0},{...entry,fields:['make','make']},{...entry,field_sources:{private_notes:'voice'}},{...entry,source:'manual'},{...entry,snapshot:'PRIVATE-SENTINEL'},{...entry,occurred_at:'bad'}]){body={data:[malformed],meta:{}};await assert.rejects(api.list('shop','piano'),e=>e instanceof InventoryClientError&&e.code==='protocol_error'&&!JSON.stringify(e).includes('PRIVATE-SENTINEL'));}
 status=503;body={code:'unavailable',detail:'PRIVATE-SENTINEL'};await assert.rejects(api.list('shop','piano'),e=>e instanceof InventoryClientError&&e.status===503&&!JSON.stringify(e).includes('PRIVATE-SENTINEL'));
});
