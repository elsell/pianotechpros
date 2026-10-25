import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPublicInquiryApiClient,createInquiryInboxApiClient,InquiryClientError} from './inquiry.js';
const contact={name:'Buyer',email:'buyer@example.com',phone:'',message:'Please arrange a visit',preference:'email' as const};
const piano={id:'piano',dealer_id:'shop',publication_revision:2,status:'available',stock_number:'PT-1',title:'Published piano',featured:false,form:'grand',player_system:false,condition:'used',make:'',model:'',manufactured:null,size:'',finish:'',description:'',price:null,photos:[{id:'photo',alt_text:''}]};
const entry={id:'inquiry',dealerName:'Shop',dealerSlug:'shop',piano,contact,createdAt:'2026-10-25T00:00:00Z',revision:1};
for(const scenario of ['accepted','challenge','rate','unavailable','network','wrong-success','redirect'] as const){
 test(`anonymous inquiry ${scenario}`,async t=>{
  let requests=0;const server=createServer(async(req,res)=>{requests++;assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);assert.equal(req.url,'/v1/showrooms/shop/pianos/piano/inquiries');assert.equal(req.method,'POST');let raw='';for await(const chunk of req)raw+=chunk;assert.equal(JSON.parse(raw).message,contact.message);
   if(scenario==='network'){res.destroy();return;}if(scenario==='accepted'){res.writeHead(204);res.end();return;}
   if(scenario==='redirect'){res.writeHead(307,{Location:'/other'});res.end();return;}
   res.writeHead(scenario==='challenge'?400:scenario==='rate'?429:scenario==='wrong-success'?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({code:scenario==='challenge'?'inquiry_challenge_rejected':'unavailable',detail:'PRIVATE BUYER DATA'}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const api=createPublicInquiryApiClient(`http://127.0.0.1:${address.port}`);
  const result=api.submit('shop','piano',{...contact,challenge:'token'});
  if(scenario==='accepted')await result;else await assert.rejects(result,(error:unknown)=>error instanceof InquiryClientError&&!JSON.stringify(error).includes('PRIVATE')&&error.code===(scenario==='challenge'?'challenge_rejected':scenario==='rate'?'rate_limited':scenario==='wrong-success'?'protocol_error':scenario==='network'||scenario==='redirect'?'network':'unavailable'));
  assert.equal(requests,1,'submission must not automatically retry');
 });
}
for(const scenario of ['valid','foreign-dealer','foreign-id','private-snapshot','bad-contact','non-string-preference','read-without-reader','read-before-receipt','inconsistent-revision','submillisecond-order','email-bytes','unknown-field','duplicate-page','unauthenticated','not-found'] as const){
 test(`inbox adapter ${scenario}`,async t=>{
  let token='first';const requests:string[]=[];const server=createServer((req,res)=>{assert.equal(req.headers.authorization,`Bearer ${token}`);requests.push(req.url!);const data:any=structuredClone(entry);
   if(scenario==='foreign-dealer')data.piano.dealer_id='other';if(scenario==='foreign-id')data.id='other';if(scenario==='private-snapshot')data.piano.private_notes='PRIVATE';if(scenario==='bad-contact')data.contact.name='Buyer\nInjected';if(scenario==='non-string-preference')data.contact.preference=['phone'];if(scenario==='read-without-reader'){data.readAt='2026-10-25T00:01:00Z';data.revision=2;}if(scenario==='read-before-receipt'){data.readAt='2026-10-24T00:00:00Z';data.readBy='reader';data.revision=2;}if(scenario==='inconsistent-revision')data.revision=2;if(scenario==='unknown-field')data.source='PRIVATE';if(scenario==='email-bytes')data.contact.email='鍵'.repeat(90)+'@example.com';if(scenario==='submillisecond-order'){data.createdAt='2026-10-25T00:00:00.0000009Z';data.readAt='2026-10-25T00:00:00.0000001Z';data.readBy='reader';data.revision=2;}
   res.setHeader('Content-Type','application/json');if(scenario==='unauthenticated'||scenario==='not-found'){res.statusCode=scenario==='unauthenticated'?401:404;res.end(JSON.stringify({detail:'PRIVATE'}));return;}
   if(req.url!.endsWith('/read')){data.readAt='2026-10-25T00:01:00Z';data.readBy='reader';data.revision=2;}
   res.end(JSON.stringify(req.url!.includes('?')?{data:scenario==='duplicate-page'?[data,data]:[data],meta:{}}:{data}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const api=createInquiryInboxApiClient(`http://127.0.0.1:${address.port}`,()=>token);
  if(scenario==='valid'){assert.deepEqual(await api.get('shop','inquiry'),entry);token='rotated';assert.equal((await api.list('shop')).inquiries.length,1);assert.equal((await api.markRead('shop','inquiry',1)).revision,2);assert.equal(requests.length,3);}
  else{const result=scenario==='duplicate-page'?api.list('shop'):api.get('shop','inquiry');await assert.rejects(result,(error:unknown)=>error instanceof InquiryClientError&&!JSON.stringify(error).includes('PRIVATE')&&error.code===(scenario==='unauthenticated'?'unauthenticated':scenario==='not-found'?'not_found':'protocol_error'));}
 });
}
