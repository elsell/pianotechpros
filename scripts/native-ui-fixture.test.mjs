import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {startNativeUIFixture} from './native-ui-fixture.mjs';
const verifier='v'.repeat(64),client='pianotechpros-mobile',redirect='pianotechpros://callback';
const challenge=createHash('sha256').update(verifier).digest('base64url');
async function code(f,changes={}){
 const params=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid profile email',state:'test-state',code_challenge:challenge,code_challenge_method:'S256',...changes});
 return fetch(f.origin+'/oidc/authorize?'+params,{redirect:'manual'});
}
async function token(f,c,changes={}){return fetch(f.origin+'/oidc/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code:c,code_verifier:verifier,...changes})});}
async function login(f){const r=await code(f);assert.equal(r.status,303);const u=new URL(r.headers.get('location'));assert.equal(u.searchParams.get('state'),'test-state');return (await (await token(f,u.searchParams.get('code'))).json()).id_token;}
async function api(f,path,body,session){return fetch(f.origin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
test('fixture exercises signed OIDC, opaque session exchange and protected API without credential seeding',async t=>{
 const f=await startNativeUIFixture();t.after(()=>f.close());
 const discovery=await (await fetch(f.origin+'/oidc/.well-known/openid-configuration')).json();assert.equal(discovery.issuer,f.origin+'/oidc');
 const identity=await login(f),parts=identity.split('.');const jwks=await (await fetch(discovery.jwks_uri)).json();assert.ok(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey({key:jwks.keys[0],format:'jwk'}),Buffer.from(parts[2],'base64url')));
 const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,client);assert.equal(claims.iss,discovery.issuer);
 assert.equal((await api(f,'/v1/me')).status,401);assert.equal((await api(f,'/v1/me',undefined,'arbitrary')).status,401);assert.equal((await api(f,'/v1/sessions',{identityToken:'arbitrary'})).status,401);
 const r=await api(f,'/v1/sessions',{identityToken:identity});assert.equal(r.status,201);const session=(await r.json()).data.token;assert.notEqual(session,identity);
 assert.equal((await api(f,'/v1/me',undefined,session)).status,200);assert.deepEqual(await (await api(f,'/v1/dealers',undefined,session)).json(),{data:[],meta:{}});
 assert.equal((await api(f,'/unsupported',undefined,session)).status,404);
});
test('fixture binds authorization codes to callback and S256 verifier and consumes them once',async t=>{
 const f=await startNativeUIFixture();t.after(()=>f.close());
 for(const changes of [{redirect_uri:'https://foreign.example/callback'},{client_id:'foreign'},{code_challenge_method:'plain'},{code_challenge:'bad'},{state:''}])assert.equal((await code(f,changes)).status,400);
 for(const changes of [{code_verifier:'wrong'},{redirect_uri:'pianotechpros://elsewhere'},{client_id:'foreign'},{}]){
  const r=await code(f),c=new URL(r.headers.get('location')).searchParams.get('code');assert.equal((await token(f,c,changes)).status,Object.keys(changes).length?400:200);assert.equal((await token(f,c)).status,400);
 }
});
test('fixture bounds bodies and rejects malformed session exchanges',async t=>{
 const f=await startNativeUIFixture();t.after(()=>f.close());
 for(const body of ['{','null','[]',JSON.stringify({identityToken:'x'.repeat(70000)})]){
  const r=await fetch(f.origin+'/v1/sessions',{method:'POST',headers:{'content-type':'application/json'},body});assert.ok([400,413].includes(r.status));
 }
});

test('fixture expires codes and identities and rotation preserves absolute session expiry',async t=>{
 let clock=Date.now();const f=await startNativeUIFixture({now:()=>clock});t.after(()=>f.close());
 let r=await code(f),c=new URL(r.headers.get('location')).searchParams.get('code');clock+=120000;assert.equal((await token(f,c)).status,400);
 const expired=await login(f);clock+=300000;assert.equal((await api(f,'/v1/sessions',{identityToken:expired})).status,401);
 const identity=await login(f),nextIdentity=await login(f);assert.notEqual(identity,nextIdentity);
 const original=(await (await api(f,'/v1/sessions',{identityToken:identity})).json()).data;
 assert.equal((await api(f,'/v1/sessions',{identityToken:identity})).status,401);
 clock+=3600000;const rotated=(await (await api(f,'/v1/session/refresh',{},original.token)).json()).data;
 assert.notEqual(rotated.token,original.token);assert.equal(rotated.expiresAt,original.expiresAt);
 assert.equal((await api(f,'/v1/me',undefined,original.token)).status,401);assert.equal((await api(f,'/v1/me',undefined,rotated.token)).status,200);
 clock+=3600000;assert.equal((await api(f,'/v1/me',undefined,rotated.token)).status,401);
});
test('profile fixture preserves private drafts through scoped reads, create replay and revision conflicts',async t=>{
 const f=await startNativeUIFixture();t.after(()=>f.close());const identity=await login(f),session=(await (await api(f,'/v1/sessions',{identityToken:identity})).json()).data.token;
 for(const domain of ['customer','technician']){
  const path='/v1/'+domain+'-profile';assert.equal((await api(f,path,undefined,session)).status,404);
  const attrs={name:'Native profile',email:'owner@example.test'};
  const create=attributes=>fetch(f.origin+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session,'idempotency-key':'one-'+domain},body:JSON.stringify({attributes})});
  let r=await create(attrs);assert.equal(r.status,201);const first=(await r.json()).data;assert.equal(first.revision,1);
  assert.deepEqual((await (await create(attrs)).json()).data,first);assert.equal((await create({...attrs,name:'changed'})).status,409);
  const update=revision=>fetch(f.origin+path,{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+session},body:JSON.stringify({expectedRevision:revision,attributes:{...attrs,name:'Updated'}})});
  assert.equal((await update(0)).status,409);r=await update(1);assert.equal(r.status,200);assert.equal((await r.json()).data.revision,2);assert.equal((await update(1)).status,409);
  const read=await (await api(f,path,undefined,session)).json();assert.equal(read.data.attributes.name,'Updated');assert.equal((await api(f,path)).status,401);
  const zones=await (await api(f,path+'/timezones',undefined,session)).json();assert.deepEqual(zones.data.names,['America/Chicago','Europe/Madrid','UTC']);
 }
});

test('authentication diagnostics expose only fixed stages and status, excluding request secrets',async t=>{
 const events=[];const f=await startNativeUIFixture({onAuthResponse:event=>events.push(event)});t.after(()=>f.close());
 await fetch(f.origin+'/oidc/.well-known/openid-configuration?private=sentinel');
 const identity=await login(f);
 const session=(await (await api(f,'/v1/sessions',{identityToken:identity})).json()).data.token;
 await api(f,'/v1/me',undefined,session);
 await api(f,'/secret-sentinel',undefined,session);
 await code(f,{client_id:'secret-sentinel'});
 assert.deepEqual(events,[
  {stage:'discovery',status:200},{stage:'authorization',status:303},
  {stage:'token',status:200},{stage:'session',status:201},
  {stage:'authorization',status:400},
 ]);
});

test('optional inventory fixture supports scoped browsing, search, status and bounded pages',async t=>{
 const f=await startNativeUIFixture({inventory:true});t.after(()=>f.close());
 const session=(await (await api(f,'/v1/sessions',{identityToken:await login(f)})).json()).data.token;
 const shops=(await (await api(f,'/v1/dealers',undefined,session)).json()).data;
 assert.equal(shops.length,1);assert.equal(shops[0].name,'Native UI Shop');
 const path='/v1/dealers/'+shops[0].id+'/inventory';
 assert.equal((await api(f,path)).status,401);
 assert.equal((await api(f,'/v1/dealers/foreign/inventory',undefined,session)).status,404);
 const read=async query=>(await (await api(f,path+query,undefined,session)).json());
 assert.deepEqual((await read('')).data.map(r=>r.status),['draft','available','reserved','in_service']);
 assert.equal((await read('?status=sold')).data[0].status,'sold');
 assert.deepEqual((await read('?search=UI-006')).data,[]);
 assert.equal((await read('?includeInactive=true&search=ui-006')).data[0].status,'archived');
 const first=await read('?includeInactive=true&limit=2');assert.equal(first.data.length,2);assert.ok(first.meta.nextCursor);
 const second=await read('?includeInactive=true&limit=2&cursor='+encodeURIComponent(first.meta.nextCursor));
 assert.equal(second.data.length,2);assert.notEqual(first.data[0].id,second.data[0].id);
 const last=await read('?includeInactive=true&limit=2&cursor='+encodeURIComponent(second.meta.nextCursor));assert.equal(last.data.length,2);assert.deepEqual(last.meta,{});
 for(const query of ['?limit=0','?limit=101','?cursor=foreign','?status=unknown'])assert.equal((await api(f,path+query,undefined,session)).status,400);
});
test('public native fixture exposes only anonymous synthetic publications',async t=>{
 const f=await startNativeUIFixture({inventory:true});t.after(()=>f.close());
 const directory=await api(f,'/v1/showroom-discovery');assert.equal(directory.status,200);
 assert.equal((await directory.json()).data.shops[0].slug,'native-public-shop');
 assert.equal((await api(f,'/v1/showroom-discovery',undefined,'arbitrary')).status,400);
 const list=await (await api(f,'/v1/showrooms/native-public-shop/pianos?search=UI-PUBLIC-1')).json();assert.equal(list.data.pianos.length,1);assert.equal(list.data.pianos[0].title,'Native Public Grand');assert.equal(list.data.pianos[0].private_notes,undefined);
 assert.equal((await api(f,'/v1/showrooms/hidden/pianos')).status,404);
 assert.equal((await api(f,'/v1/showrooms/native-public-shop/pianos/hidden')).status,404);
 const image=await api(f,'/v1/showrooms/native-public-shop/pianos/public-grand/photos/front');assert.equal(image.headers.get('content-type'),'image/jpeg');assert.ok((await image.arrayBuffer()).byteLength>4);
 assert.equal((await api(f,'/v1/dealers')).status,401);
});
test('native inquiry fake preserves explicit retry and rejects credentials and hidden listings',async t=>{
 const f=await startNativeUIFixture({inventory:true});t.after(()=>f.close());
 const path='/v1/showrooms/native-public-shop/pianos/public-grand/inquiries';
 const body={name:'Synthetic Buyer',email:'buyer@example.test',phone:'',message:'Arrange a visit',preference:'email',challenge:'',honeypot:''};
 assert.equal((await api(f,path,body,'private-session')).status,400);
 assert.equal((await api(f,path.replace('public-grand','hidden'),body)).status,404);
 assert.equal((await api(f,path,{...body,message:''})).status,400);
 assert.equal((await api(f,path,body)).status,503);
 const accepted=await api(f,path,body);assert.equal(accepted.status,204);assert.equal(await accepted.text(),'');
});
