import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {sessionScopedFailure} from './session-scoped-failure';
import {DealerClientError,createDealerApiClient} from './dealer';
import {InventoryClientError,createInventoryApiClient} from './inventory';
import {InquiryClientError,createInquiryInboxApiClient} from './inquiry';
import {VoiceClientError,createInventoryVoiceApiClient} from './inventory-voice';
import {CustomerProfileClientError,createCustomerProfileApiClient} from './customer-profile';
const errors=[DealerClientError,InventoryClientError,InquiryClientError,VoiceClientError,CustomerProfileClientError] as const;
test('only retired credential 401 becomes transient, without credential or cause disclosure',()=>{
 for(const ErrorType of errors){
  const denied=new ErrorType('unauthenticated',401);
  const retired=sessionScopedFailure(denied,'old-private-token','new-private-token');assert.ok(retired instanceof ErrorType);assert.equal((retired as DealerClientError).code,'unavailable');assert.equal((retired as DealerClientError).status,503);assert.ok(!JSON.stringify(retired).includes('private-token'));
  assert.equal(sessionScopedFailure(denied,'current','current'),denied);assert.equal(sessionScopedFailure(denied,'old',null),denied);
  for(const [code,status] of [['not_found',403],['not_found',404],['unavailable',503],['conflict',409],['network',0]] as const){const error=new ErrorType(code,status);assert.equal(sessionScopedFailure(error,'old','new'),error);}
 }
 const unknown={status:401,cause:'private'};assert.equal(sessionScopedFailure(unknown,'old','new'),unknown);
});
test('real delayed HTTP rejection uses the captured credential and preserves a replacement',async t=>{
 let respond!:(()=>void);let received!:(()=>void);let ready=new Promise<void>(r=>{received=r;});const calls:string[]=[];
 const server=createServer((req,res)=>{calls.push(req.headers.authorization??'');respond=()=>{res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'unauthenticated'}));};received();});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
 const operations=[(token:string)=>createDealerApiClient(url,()=>token).list(),(token:string)=>createInventoryApiClient(url,()=>token).get('shop','piano'),(token:string)=>createInquiryInboxApiClient(url,()=>token).list('shop'),(token:string)=>createInventoryVoiceApiClient(url,()=>token).extract('shop','piano',1,'A grand piano'),(token:string)=>createCustomerProfileApiClient(url,()=>token).get()];
 for(const operation of operations){
  ready=new Promise<void>(r=>{received=r;});let current='before';const dispatched=current;
  const pending=operation(dispatched).catch(error=>{throw sessionScopedFailure(error,dispatched,current);});const rejection=assert.rejects(pending,(error:unknown)=>error instanceof Error&&(error as DealerClientError).code==='unavailable'&&(error as DealerClientError).status===503);
  await ready;current='after';respond();await rejection;
 }
 assert.deepEqual(calls,Array(operations.length).fill('Bearer before'));
});
