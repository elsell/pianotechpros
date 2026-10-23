import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createInventoryPublicationApiClient,InventoryPublicationError,type InventoryPublicationState} from './inventory-publication.js';

function fixture():InventoryPublicationState{return {
 record:{id:'piano',dealer_id:'shop',revision:3,status:'available',attributes:{stock_number:'PT-1',title:'Private draft'},created_at:'2026-10-22T12:00:00Z',updated_at:'2026-10-22T12:00:00Z'},
 publication:{visible:true,applied_revision:2,snapshot:{id:'piano',dealer_id:'shop',publication_revision:2,status:'available',stock_number:'PT-1',title:'Published piano',featured:false,form:'grand',player_system:false,condition:'used',make:'Maker',model:'Model',manufactured:null,size:'',finish:'',description:'',price:{minor_units:100,currency:'USD'},photos:[{id:'photo',alt_text:'Front'}]}},
};}
test('publication transport uses generated scoped routes, current credentials and immutable command amounts',async t=>{
 let current=fixture();const requests:{path:string;body:any;token?:string}[]=[];
 const server=createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):null;
  requests.push({path:req.url!,body,token:req.headers.authorization});
  if(body){current.record.revision=body.expectedRevision+1;current.publication!.applied_revision=current.record.revision;
   if(req.url!.endsWith('/publish')){current.publication!.visible=true;current.publication!.snapshot.publication_revision=current.record.revision;}
   if(req.url!.endsWith('/unpublish'))current.publication!.visible=false;
   if(req.url!.endsWith('/lifecycle')){current.record.status=body.status;current.publication!.snapshot.status=body.status;}
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:current}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 let token='one';let gate:Promise<void>|undefined;let release!:()=>void;
 const api=createInventoryPublicationApiClient(`http://127.0.0.1:${address.port}`,async()=>{await gate;return token;});
 assert.deepEqual(await api.get('shop','piano'),fixture());
 await api.publish('shop','piano',3);
 gate=new Promise<void>(resolve=>{release=resolve;});const price={minor_units:90,currency:'USD'};
 const sale=api.transition('shop','piano',4,'sold',price,'');price.minor_units=1;token='two';release();
 assert.equal((await sale).record.status,'sold');assert.deepEqual(requests.at(-1)!.body.salePrice,{minor_units:90,currency:'USD'});assert.equal(requests.at(-1)!.token,'Bearer two');
 assert.equal((await api.unpublish('shop','piano',5)).publication!.visible,false);
 assert.deepEqual(requests.map(r=>r.path),['/v1/dealers/shop/inventory/piano/publication','/v1/dealers/shop/inventory/piano/publish','/v1/dealers/shop/inventory/piano/lifecycle','/v1/dealers/shop/inventory/piano/unpublish']);
});
for(const scenario of ['array-form','array-condition','foreign-record','foreign-dealer','foreign-snapshot','unsafe-revision','future-overlay','old-publication','wrong-status','private-field','duplicate-photo','bad-price','bad-date','too-many-photos','bad-title','visible-archive','bad-json','network','readiness','bad-readiness','denied','unknown-error','wrong-command-revision','wrong-command-effect','null-publication'] as const){
 test(`publication transport validates ${scenario}`,async t=>{
  const server=createServer((_req,res)=>{
   if(scenario==='network'){res.destroy();return;}res.setHeader('Content-Type','application/json');
   if(scenario==='bad-json'){res.end('PRIVATE');return;}
   if(['readiness','bad-readiness','denied','unknown-error'].includes(scenario)){res.statusCode=scenario==='denied'?404:422;res.end(JSON.stringify({code:scenario==='unknown-error'?'PRIVATE':scenario==='denied'?'not_found':'inventory_not_ready',missing:scenario==='bad-readiness'?['PRIVATE']:['form','photo'],detail:'PRIVATE'}));return;}
   const state:any=fixture();const snapshot=state.publication.snapshot;
   if(scenario==='array-form')snapshot.form=['grand'];if(scenario==='array-condition')snapshot.condition=['used'];
   if(scenario==='foreign-record')state.record.id='other';if(scenario==='foreign-dealer')state.record.dealer_id='other';if(scenario==='foreign-snapshot')snapshot.dealer_id='other';
   if(scenario==='unsafe-revision')state.record.revision=9007199254740992;if(scenario==='future-overlay')state.publication.applied_revision=4;if(scenario==='old-publication')snapshot.publication_revision=1;
   if(scenario==='wrong-status')snapshot.status='sold';if(scenario==='private-field')snapshot.private_notes='PRIVATE';if(scenario==='duplicate-photo')snapshot.photos.push({...snapshot.photos[0]});
   if(scenario==='bad-price')snapshot.price.minor_units=-1;if(scenario==='bad-date')snapshot.manufactured={year:2025,month:2,day:29};
   if(scenario==='too-many-photos')snapshot.photos=Array.from({length:51},(_,i)=>({id:String(i),alt_text:''}));if(scenario==='bad-title')snapshot.title='x'.repeat(322);
   if(scenario==='visible-archive'){state.record.status='archived';snapshot.status='archived';}
   if(scenario==='wrong-command-effect'){state.record.revision=4;state.publication.applied_revision=4;state.publication.snapshot.publication_revision=4;state.publication.visible=false;}
   if(scenario==='null-publication')state.publication=null;
   res.end(JSON.stringify({data:state}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
  const api=createInventoryPublicationApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
  const result=scenario.startsWith('wrong-command')?api.publish('shop','piano',3):api.get('shop','piano');
  if(scenario==='null-publication'){assert.equal((await result).publication,null);return;}
  const code=scenario==='network'?'network':scenario==='readiness'?'inventory_not_ready':scenario==='denied'?'not_found':'protocol_error';
  await assert.rejects(result,(error:unknown)=>error instanceof InventoryPublicationError&&error.code===code&&!JSON.stringify(error).includes('PRIVATE')&&(scenario!=='readiness'||JSON.stringify(error.missing)==='["form","photo"]'));
 });
}
test('invalid revisions and already aborted commands never dispatch',async t=>{
 let calls=0;const server=createServer((_req,res)=>{calls++;res.end('{}');});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryPublicationApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
 for(const revision of [0,-1,NaN,9007199254740992])await assert.rejects(api.publish('shop','piano',revision));
 const abort=new AbortController();abort.abort();await assert.rejects(api.publish('shop','piano',3,abort.signal));assert.equal(calls,0);
});
