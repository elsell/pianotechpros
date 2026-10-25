import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createCustomerProfileApiClient,CustomerProfileClientError,type CustomerProfileAttributes} from './customer-profile.js';
const attributes=():CustomerProfileAttributes=>({name:'Ada',isBusiness:false,email:'ada@example.test',locations:[{key:'home',label:'Home',street1:'1 Main',city:'Town',region:'State',postalCode:'123',timezone:'UTC'}],pianos:[{key:'piano',locationKey:'home',nickname:'Studio',form:'grand',player:false,manufacturedYear:1924}]});
const profile=()=>({id:'profile',revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',attributes:attributes()});
async function fixture(t:test.TestContext){
 let data:unknown=profile(),status=200,raw:string|undefined,disconnect=false;
 const calls:{method:string;url:string;auth?:string;key?:string;body:any}[]=[];
 const server=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;calls.push({method:req.method!,url:req.url!,auth:req.headers.authorization,key:req.headers['idempotency-key'] as string|undefined,body:body?JSON.parse(body):null});if(disconnect){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json'});res.end(raw??JSON.stringify(status<400?{data}:{code:data,detail:'PRIVATE'}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 return {url:`http://127.0.0.1:${address.port}`,calls,set(value:unknown,code=200){data=value;status=code;},raw(value:string){raw=value;},disconnect(){disconnect=true;}};
}
const error=(code:string)=>(e:unknown)=>e instanceof CustomerProfileClientError&&e.code===code&&!JSON.stringify(e).includes('PRIVATE');
test('customer commands snapshot child edits, use fresh sessions and preserve revision/key semantics',async t=>{
 const f=await fixture(t);let token='one',wait:Promise<void>|undefined,release!:()=>void;
 const api=createCustomerProfileApiClient(f.url,async()=>{await wait;return token;});
 assert.deepEqual(await api.get(),profile());
 wait=new Promise<void>(r=>{release=r;});const input=attributes();const pending=api.create(input,'stable-profile-command');input.locations[0]!.label='Changed';input.pianos[0]!.manufacturedYear=2000;token='two';release();await pending;
 assert.equal(f.calls[1]!.auth,'Bearer two');assert.equal(f.calls[1]!.key,'stable-profile-command');assert.deepEqual(f.calls[1]!.body,{attributes:attributes()});
 f.set({...profile(),revision:2});await api.save('profile',attributes(),1);assert.deepEqual(f.calls[2]!.body,{expectedRevision:1,attributes:attributes()});
 assert.ok(f.calls.every(c=>c.url==='/v1/customer-profile'));
 f.set({names:['CET','UTC']});assert.deepEqual(await api.timezones(),['CET','UTC']);
 const unknown=profile();unknown.attributes.pianos[0]!.manufacturedYear=null;f.set(unknown);assert.equal((await api.get()).attributes.pianos[0]!.manufacturedYear,null);
 const before=f.calls.length;await assert.rejects(api.save('profile',attributes(),0),error('validation_failed'));await assert.rejects(api.create(attributes(),'bad\nkey'),error('validation_failed'));await assert.rejects(api.create({...attributes(),ownerUserID:'other'} as CustomerProfileAttributes,'stable-profile-command'),error('validation_failed'));assert.equal(f.calls.length,before);
});
test('customer response guard rejects malformed or foreign profile state',async t=>{
 const f=await fixture(t);const api=createCustomerProfileApiClient(f.url,()=>null);
 const variants:any[]=[{...profile(),ownerUserID:'PRIVATE'},{...profile(),revision:2**53},{...profile(),createdAt:'2026-02-30T00:00:00Z'},{...profile(),updatedAt:'2025-01-01T00:00:00Z'}];
 for(const change of [(a:any)=>a.locations.push({...a.locations[0]}),(a:any)=>a.pianos[0].locationKey='foreign',(a:any)=>a.pianos[0].form='unknown',(a:any)=>a.pianos[0].manufacturedYear=1500,(a:any)=>a.pianos[0].nickname='',(a:any)=>a.email={value:'PRIVATE'},(a:any)=>a.locations[0].owner='PRIVATE',(a:any)=>a.locations=Array.from({length:51},(_,i)=>({...a.locations[0],key:'l'+i})),(a:any)=>a.pianos=Array.from({length:201},(_,i)=>({...a.pianos[0],key:'p'+i})),(a:any)=>a.name='x'.repeat(201),(a:any)=>a.name='bad\u0000name']){const v=profile();change(v.attributes);variants.push(v);}
 for(const v of variants){f.set(v);await assert.rejects(api.get(),error('protocol_error'));}
 f.set(profile());assert.equal((await api.save('profile',attributes(),1)).revision,1);
 for(const v of [{...profile(),id:'foreign'},{...profile(),revision:4}]){f.set(v);await assert.rejects(api.save('profile',attributes(),1),error('protocol_error'));}
 for(const names of [['UTC','CET'],['UTC','UTC'],['Local','UTC'],[],['UTC','../PRIVATE']]){f.set({names});await assert.rejects(api.timezones(),error('protocol_error'));}
 for(const code of ['conflict','authorization_pending','invalid_credential','PRIVATE']){f.set(code,code==='conflict'?409:503);await assert.rejects(api.get(),error(code==='PRIVATE'?'protocol_error':code));}
 f.raw('PRIVATE');await assert.rejects(api.get(),error('protocol_error'));
 f.disconnect();await assert.rejects(api.get(),error('network'));
});

test('customer cancellation and credential lookup failures reveal no private cause',async t=>{
 const f=await fixture(t);const controller=new AbortController();controller.abort();
 const api=createCustomerProfileApiClient(f.url,()=> 'session');
 await assert.rejects(api.get(controller.signal),error('network'));assert.equal(f.calls.length,0);
 const unavailable=createCustomerProfileApiClient(f.url,()=>{throw new Error('PRIVATE');});
 await assert.rejects(unavailable.create(attributes(),'customer-command-001'),error('network'));assert.equal(f.calls.length,0);
});
