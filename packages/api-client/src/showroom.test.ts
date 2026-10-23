import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createShowroomApiClient,ShowroomClientError} from './showroom.js';

const profile={id:'shop',name:'Piano shop',slug:'shop',email:'shop@example.com',phone:'',website_url:'',tagline:'',description:'',street_address_1:'',street_address_2:'',city:'',region:'',postal_code:'',appointment_note:'',delivery_note:'',warranty_note:'',service_note:'',banner_alt_text:'',accent_color:'#123456'};
const piano={id:'piano',dealer_id:'shop',publication_revision:2,status:'available',stock_number:'PT-1',title:'Published piano',featured:false,form:'grand',player_system:false,condition:'used',make:'',model:'',manufactured:null,size:'',finish:'',description:'',price:null,photos:[{id:'photo',alt_text:''}]};

for(const scenario of ['valid','long-name','local-email','reserved-email','foreign','private','unsafe-link','bad-price','duplicate','oversized','not-found','network'] as const){
 test(`public adapter ${scenario}`,async t=>{
  let received='';const server=createServer((req,res)=>{assert.equal(req.headers.authorization,undefined);assert.equal(req.headers.cookie,undefined);received=req.url!;if(scenario==='network'){res.destroy();return;}res.setHeader('Content-Type','application/json');if(scenario==='not-found'){res.statusCode=404;res.end(JSON.stringify({detail:'PRIVATE'}));return;}
   const data:any={profile:{...profile},pianos:[structuredClone(piano)]};
   if(scenario==='long-name')data.profile.name='鍵'.repeat(200);if(scenario==='local-email')data.profile.email='shop@localhost';if(scenario==='reserved-email')data.profile.email='shop?bcc=other@example.com';
   if(scenario==='foreign')data.pianos[0].dealer_id='other';if(scenario==='private')data.pianos[0].private_notes='PRIVATE';if(scenario==='unsafe-link')data.profile.website_url='javascript:alert(1)';if(scenario==='bad-price')data.pianos[0].price={minor_units:-1,currency:'USD'};if(scenario==='duplicate')data.pianos.push(structuredClone(piano));if(scenario==='oversized')data.pianos=Array.from({length:31},(_,i)=>({...piano,id:String(i)}));
   res.end(JSON.stringify({data,meta:{}}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const api=createShowroomApiClient(`http://127.0.0.1:${address.port}`);
  const result=api.list('shop',{currency:'USD',maxPrice:0});
  if(['valid','long-name','local-email','reserved-email'].includes(scenario)){assert.equal((await result).pianos[0].title,'Published piano');assert.match(received,/maxPrice=0/);}else{await assert.rejects(result,(e:unknown)=>e instanceof ShowroomClientError&&!JSON.stringify(e).includes('PRIVATE')&&e.code===(scenario==='network'?'network':scenario==='not-found'?'not_found':'protocol_error'));}
 });
}

test('public detail and photo use scoped routes and reject unsafe media',async t=>{
 const jpeg=readFileSync(new URL('../../../scripts/fixtures/showroom.jpg',import.meta.url));let mediaValid=true;const requests:string[]=[];
 const server=createServer((req,res)=>{requests.push(req.url!);assert.equal(req.headers.authorization,undefined);if(req.url!.endsWith('/photos/photo')){res.setHeader('Content-Type',mediaValid?'image/jpeg':'text/html');res.end(mediaValid?jpeg:Buffer.from('PRIVATE'));return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{profile,piano}}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');const api=createShowroomApiClient(`http://127.0.0.1:${address.port}`);
 assert.deepEqual((await api.listing('shop','piano')).piano,piano);
 assert.deepEqual(Buffer.from(await api.photo('shop','piano','photo')),jpeg);
 mediaValid=false;await assert.rejects(api.photo('shop','piano','photo'),(e:unknown)=>e instanceof ShowroomClientError&&e.code==='protocol_error');
 const count=requests.length;await assert.rejects(api.photo('shop','piano','../private'));assert.equal(requests.length,count);
 assert.deepEqual(requests.slice(0,2),['/v1/showrooms/shop/pianos/piano','/v1/showrooms/shop/pianos/piano/photos/photo']);
});
