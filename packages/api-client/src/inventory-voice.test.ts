import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createInventoryVoiceApiClient,VoiceClientError} from './inventory-voice.js';
const proposal={revision:3,transcript:'Grand piano not featured',candidates:[{field:'title',value:{text:'Grand piano'},confidence:'high',evidence:'Grand piano'},{field:'featured',value:{boolean:false},confidence:'uncertain',evidence:'not featured'}]};
test('voice transport copies binary audio, preserves MIME and rotates credentials',async t=>{
 let token='first';const requests:string[]=[];const server=createServer(async(req,res)=>{requests.push(req.url!);assert.equal(req.headers.authorization,`Bearer ${token}`);assert.equal(req.headers.cookie,undefined);let body=Buffer.alloc(0);for await(const chunk of req)body=Buffer.concat([body,chunk]);res.setHeader('Content-Type','application/json');
 if(req.url!.includes('/transcribe')){assert.equal(req.headers['content-type'],'audio/webm;codecs=opus');assert.deepEqual([...body],[1,2,3]);res.end(JSON.stringify({data:{revision:3,transcript:proposal.transcript}}));}
 else{assert.deepEqual(JSON.parse(body.toString()),{expectedRevision:3,transcript:proposal.transcript});res.end(JSON.stringify({data:proposal}));}
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryVoiceApiClient(`http://127.0.0.1:${address.port}`,async()=>token);const bytes=new Uint8Array([1,2,3]);const task=api.transcribe('shop','piano',3,bytes,'audio/webm;codecs=opus');bytes.fill(9);assert.equal((await task).transcript,proposal.transcript);
 token='rotated';assert.deepEqual(await api.extract('shop','piano',3,proposal.transcript),proposal);assert.equal(requests.length,2);
});
for(const scenario of ['wrong-revision','wrong-transcript','duplicate','protected-field','unknown','blank','unsafe-money','bad-date','ungrounded','wrong-type','unauthenticated','not-found','conflict','rate','unavailable','redirect','wrong-success'] as const){
 test(`voice rejects ${scenario}`,async t=>{
 let calls=0;const server=createServer((req,res)=>{calls++;const data:any=structuredClone(proposal);res.setHeader('Content-Type','application/json');
 if(scenario==='wrong-revision')data.revision=4;if(scenario==='wrong-transcript')data.transcript='another';if(scenario==='duplicate')data.candidates.push(data.candidates[0]);if(scenario==='protected-field')data.candidates[0].field='status';if(scenario==='unknown')data.private_notes='SECRET';if(scenario==='blank')data.candidates[0].value.text='';if(scenario==='ungrounded')data.candidates[0].evidence='invented';if(scenario==='wrong-type')data.candidates[1].value.boolean='false';
 if(scenario==='unsafe-money')data.candidates[0]={field:'asking_price',value:{money:{minor_units:9007199254740992,currency:'USD'}},confidence:'high',evidence:'Grand piano'};
 if(scenario==='bad-date')data.candidates[0]={field:'manufactured',value:{date:{year:2025,month:2,day:29}},confidence:'high',evidence:'Grand piano'};
 const status=scenario==='unauthenticated'?401:scenario==='not-found'?404:scenario==='conflict'?409:scenario==='rate'?429:scenario==='unavailable'?503:scenario==='redirect'?307:scenario==='wrong-success'?201:200;
 res.statusCode=status;if(status===307)res.setHeader('Location','/other');res.end(JSON.stringify(status>=400?{detail:'PRIVATE PROVIDER DATA'}:{data}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const api=createInventoryVoiceApiClient(`http://127.0.0.1:${address.port}`,()=> 'token');
 const expected=scenario==='unauthenticated'?'unauthenticated':scenario==='not-found'?'not_found':scenario==='conflict'?'conflict':scenario==='rate'?'rate_limited':scenario==='unavailable'?'unavailable':scenario==='redirect'?'network':'protocol_error';
 await assert.rejects(api.extract('shop','piano',3,proposal.transcript),(e:unknown)=>e instanceof VoiceClientError&&e.code===expected&&!JSON.stringify(e).includes('PRIVATE'));
 assert.equal(calls,1);
 });
}
test('invalid input and cancellation do not acquire a credential',async()=>{
 let calls=0;const api=createInventoryVoiceApiClient('http://127.0.0.1:1',()=>{calls++;return 'token';});
 for(const [dealer,id,revision] of [['../other','piano',3],['shop','piano',0],['shop','piano',1.5]] as const)await assert.rejects(api.extract(dealer,id,revision,'Grand'),VoiceClientError);
 await assert.rejects(api.transcribe('shop','piano',1,new Uint8Array(), 'audio/wav'),VoiceClientError);
 await assert.rejects(api.transcribe('shop','piano',1,new Uint8Array(6*1024*1024+1),'audio/wav'),VoiceClientError);
 await assert.rejects(api.transcribe('shop','piano',1,new Uint8Array([1]),'text/plain'),VoiceClientError);
 const controller=new AbortController();controller.abort();await assert.rejects(api.extract('shop','piano',1,'Grand',controller.signal),(e:unknown)=>e instanceof VoiceClientError&&e.code==='cancelled');assert.equal(calls,0);
});

test('in-flight cancellation discards late voice output',async t=>{
 let received!:()=>void;const started=new Promise<void>(resolve=>received=resolve);let respond!:()=>void;
 const server=createServer(async(req,res)=>{for await(const _ of req){};respond=()=>{if(!res.destroyed){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:proposal}));}};received();});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryVoiceApiClient(`http://127.0.0.1:${address.port}`,()=> 'token');const controller=new AbortController();const pending=api.extract('shop','piano',3,proposal.transcript,controller.signal);const rejected=assert.rejects(pending,(e:unknown)=>e instanceof VoiceClientError&&e.code==='cancelled');
 await started;controller.abort();respond();await rejected;
});
test('voice accepts exact money, partial dates and all supported field variants',async t=>{
 const values:Record<string,unknown>={stock_number:'PT-NEW',title:'Grand',make:'Yamaha',model:'C3',serial:'123',size:'6 feet',finish:'Black',location:'Room',description:'Piano',private_notes:'Bench',form:'grand',condition:'used',featured:false,player_system:true,price_visible:false,asking_price:{minor_units:Number.MAX_SAFE_INTEGER,currency:'USD'},acquisition_cost:{minor_units:0,currency:'JPY'},manufactured:{year:1920,month:0,day:0}};
 const data={revision:3,transcript:'description',candidates:Object.entries(values).map(([field,value])=>({field,value:typeof value==='string'?{text:value}:typeof value==='boolean'?{boolean:value}:field==='manufactured'?{date:value}:{money:value},confidence:'high',evidence:'description'}))};
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createInventoryVoiceApiClient(`http://127.0.0.1:${address.port}`,()=> 'token');assert.deepEqual(await api.extract('shop','piano',3,'description'),data);
});
