import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createInventoryApiClient, InventoryClientError } from './inventory.js';

const record = { id: 'piano', dealer_id: 'shop', revision: 1, status: 'draft', attributes: { stock_number: 'PT-1', asking_price: { minor_units: 12345, currency: 'USD' }, manufactured: { year: 1920, month: 0, day: 0 } }, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z' };

test('inventory wire adapter preserves intent, private attributes, revision and current session', async (t) => {
 let token='first'; let current=structuredClone(record);const requests:{url:string;token:string|undefined;key:string|undefined;body:unknown}[]=[];
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):undefined;requests.push({url:req.url!,token:req.headers.authorization,key:req.headers['idempotency-key'] as string|undefined,body});
  res.setHeader('Content-Type','application/json');
  if(req.method==='PUT'){
   if(body.expectedRevision!==current.revision){res.statusCode=409;res.end(JSON.stringify({code:'conflict',detail:'PRIVATE-SENTINEL'}));return;}
   current={...current,revision:current.revision+1,attributes:body.attributes};
  }
  res.end(JSON.stringify({data:current}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryApiClient(`http://127.0.0.1:${address.port}`,()=>token);
 assert.equal((await api.createDraft('shop','same-intent')).id,'piano');await api.createDraft('shop','same-intent');assert.equal(requests[0].key,requests[1].key);assert.equal(requests[0].body,undefined);
 token='second';const attributes={...record.attributes,private_notes:'PRIVATE-SENTINEL'};
 const edited=await api.edit('shop','piano',attributes,1);assert.equal(edited.revision,2);assert.deepEqual(edited.attributes,attributes);assert.equal(requests.at(-1)?.token,'Bearer second');assert.deepEqual(requests.at(-1)?.body,{expectedRevision:1,attributes});assert.ok(requests.every(r=>!r.url.includes('PRIVATE-SENTINEL')));
 await assert.rejects(api.edit('shop','piano',attributes,1),(e:unknown)=>e instanceof InventoryClientError&&e.code==='conflict'&&e.status===409&&!JSON.stringify(e).includes('PRIVATE-SENTINEL'));
 assert.equal((await api.get('shop','piano')).revision,2);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const delayed=createInventoryApiClient(`http://127.0.0.1:${address.port}`,async()=>{await gate;return token;});
 const changing=structuredClone(attributes);const pending=delayed.edit('shop','piano',changing,2);changing.asking_price.minor_units=999;changing.manufactured.year=2020;release();
 const saved=await pending;assert.equal(saved.attributes.asking_price?.minor_units,12345);assert.equal(saved.attributes.manufactured?.year,1920);
 const cleared=await api.edit('shop','piano',{stock_number:'PT-1',asking_price:null,acquisition_cost:null,manufactured:null},3);
 assert.equal(cleared.attributes.asking_price,null);assert.equal(cleared.attributes.manufactured,null);
 let resume!:()=>void;const held=new Promise<void>(resolve=>{resume=resolve;});
 const attributed=createInventoryApiClient(`http://127.0.0.1:${address.port}`,async()=>{await held;return token;});
 const voiceFields:('make'|'private_notes')[]=['make'];
 const proposed={stock_number:'PT-1',make:'Steinway',private_notes:'manual'};
 const attributedSave=attributed.edit('shop','piano',proposed,4,voiceFields);
 voiceFields[0]='private_notes';proposed.make='Changed later';resume();
 assert.equal((await attributedSave).attributes.make,'Steinway');
 assert.deepEqual(requests.at(-1)?.body,{expectedRevision:4,attributes:{stock_number:'PT-1',make:'Steinway',private_notes:'manual'},voiceFields:['make']});


});

for(const scenario of ['wrong-dealer','wrong-id','unsafe-revision','unsafe-money','bad-date','imprecise-date','invalid-calendar','bad-title','bad-boolean','bad-status','empty','bad-json','network','unknown-error','401','404','429','503'] as const){
 test(`inventory adapter safely rejects ${scenario}`,async(t)=>{
  const server=createServer((_req,res)=>{
   if(scenario==='network'){res.destroy();return;}
   res.setHeader('Content-Type','application/json');
   if(scenario==='bad-json'){res.end('PRIVATE-SENTINEL');return;}
   if(['401','404','429','503','unknown-error'].includes(scenario)) {res.statusCode=scenario==='unknown-error'?500:Number(scenario);res.end(JSON.stringify({code:({'401':'unauthenticated','404':'not_found','429':'rate_limited','503':'unavailable'} as Record<string,string>)[scenario]??'PRIVATE-SENTINEL',detail:'PRIVATE-SENTINEL'}));return;}
   const value=structuredClone(record);
   if(scenario==='wrong-dealer')value.dealer_id='another';if(scenario==='wrong-id')value.id='another';if(scenario==='unsafe-revision')value.revision=9007199254740992;if(scenario==='unsafe-money')value.attributes.asking_price.minor_units=9007199254740992;
   const fields=value.attributes as Record<string,unknown>;
   if(scenario==='bad-date')fields.manufactured='PRIVATE-SENTINEL';
   if(scenario==='imprecise-date')fields.manufactured={year:1920,month:0,day:29};
   if(scenario==='invalid-calendar')fields.manufactured={year:1900,month:2,day:29};
   if(scenario==='bad-title')fields.title={private:'PRIVATE-SENTINEL'};
   if(scenario==='bad-boolean')fields.featured='yes';
   if(scenario==='bad-status')(value as Record<string,unknown>).status=['draft'];
   res.end(JSON.stringify(scenario==='empty'?{}:{data:value}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
  const api=createInventoryApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
  await assert.rejects(api.get('shop','piano'),(e:unknown)=>e instanceof InventoryClientError&&!JSON.stringify(e).includes('PRIVATE-SENTINEL')&&!e.message.includes('PRIVATE-SENTINEL')&&(!['401','404','429','503'].includes(scenario)||e.status===Number(scenario)));
 });
}

test('inventory listing sends exact filters and current credentials and normalizes terminal pages',async(t)=>{
 let token='first';const received:{url:URL;token:string|undefined}[]=[];
 const server=createServer((req,res)=>{received.push({url:new URL(req.url!,'http://fixture'),token:req.headers.authorization});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:received.length===1?[record]:[],meta:received.length===1?{nextCursor:'opaque-next'}:{}}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryApiClient(`http://127.0.0.1:${address.port}`,()=>token);
 const first=await api.list('shop',{search:'100%_ & Grand',status:'sold',includeInactive:true,limit:1});assert.equal(first.items[0]?.id,'piano');assert.equal(first.nextCursor,'opaque-next');
 assert.equal(received[0]?.url.pathname,'/v1/dealers/shop/inventory');assert.equal(received[0]?.url.searchParams.get('search'),'100%_ & Grand');assert.equal(received[0]?.url.searchParams.get('status'),'sold');assert.equal(received[0]?.url.searchParams.get('includeInactive'),'true');
 token='second';const last=await api.list('shop',{cursor:first.nextCursor});assert.deepEqual(last,{items:[],nextCursor:undefined});assert.equal(received[1]?.token,'Bearer second');
});
for(const scenario of ['wrong-dealer','duplicate','over-limit','bad-cursor','missing-meta','empty-continuation','repeated-cursor','bad-record','denied','network'] as const){
 test(`inventory list rejects ${scenario} without returning a partial page`,async(t)=>{
  const server=createServer((_req,res)=>{
   if(scenario==='network'){res.destroy();return;}
   res.setHeader('Content-Type','application/json');if(scenario==='denied'){res.statusCode=404;res.end(JSON.stringify({code:'not_found',detail:'PRIVATE-SENTINEL'}));return;}
   const entry=structuredClone(record);const body:{data:unknown[];meta?:unknown}={data:[entry],meta:{}};
   if(scenario==='wrong-dealer')entry.dealer_id='other';if(scenario==='duplicate')body.data=[entry,entry];if(scenario==='over-limit')body.data=[entry,{...entry,id:'second'}];
   if(scenario==='bad-cursor')body.meta={nextCursor:42};if(scenario==='missing-meta')delete body.meta;
   if(scenario==='empty-continuation'){body.data=[];body.meta={nextCursor:'next'};}if(scenario==='repeated-cursor')body.meta={nextCursor:'same'};
   if(scenario==='bad-record')entry.revision=9007199254740992;
   res.end(JSON.stringify(body));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
  const api=createInventoryApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
  await assert.rejects(api.list('shop',{limit:scenario==='over-limit'?1:100,cursor:'same'}),(e:unknown)=>e instanceof InventoryClientError&&!e.message.includes('PRIVATE-SENTINEL')&&e.code===(scenario==='denied'?'not_found':scenario==='network'?'network':'protocol_error'));
 });
}
