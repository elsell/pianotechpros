// Read-back acceptance against the actual isolated API, never fixture state.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
const loopback=port=>{assert.match(port,/^[0-9]{4,5}$/);assert.ok(Number(port)>=1024&&Number(port)<=65535);return 'http://127.0.0.1:'+port;};
const origin=loopback(process.env.NATIVE_ACCEPTANCE_IDENTITY_PORT??'18082'),api=loopback(process.env.NATIVE_ACCEPTANCE_API_PORT??'18083');
const verifier=randomBytes(48).toString('base64url'),state=randomBytes(24).toString('base64url');
const client='pianotechpros-mobile',redirect='pianotechpros://callback';
const parameters=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid profile email',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
const response=await fetch(origin+'/oidc/authorize?'+parameters,{redirect:'manual'});
assert.equal(response.status,303);
const callback=new URL(response.headers.get('location'));
assert.equal(callback.protocol,'pianotechpros:');assert.equal(callback.hostname,'callback');assert.equal(callback.pathname,'');
assert.equal(callback.searchParams.get('state'),state);
const tokenResponse=await fetch(origin+'/oidc/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier})});
assert.equal(tokenResponse.status,200);
const identity=(await tokenResponse.json()).id_token;
const exchange=await fetch(api+'/v1/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identityToken:identity})});
assert.equal(exchange.status,200);
const session=(await exchange.json()).data.token;
const profiles={};
for(const domain of ['customer','technician']){
 const path=api+'/v1/'+domain+'-profile';
 for(const authorization of [undefined,'Bearer malformed','Bearer '+identity]){
  assert.equal((await fetch(path,{headers:authorization?{authorization}:{}})).status,401);
 }
 const read=await fetch(path,{headers:{authorization:'Bearer '+session}});
 assert.equal(read.status,process.argv.includes('--empty')?404:200,domain+' persisted read');
 if(read.status===200)profiles[domain]=(await read.json()).data;
}
if(!process.argv.includes('--empty')){
 const customer=profiles.customer,technician=profiles.technician;
 assert.equal(customer.revision,1);assert.equal(technician.revision,1);
 assert.equal(customer.attributes.name,'iOS Customer');assert.equal(customer.attributes.email,'customer@example.test');
 assert.equal(customer.attributes.locations.length,1);
 const location=customer.attributes.locations[0];
 assert.equal(location.label,'Home');assert.equal(location.timezone,'UTC');
 for(const [key,value] of Object.entries({street1:'1 Test Street',city:'Boston',region:'MA',postalCode:'02110'}))assert.equal(location[key],value);
 assert.equal(technician.attributes.name,'iOS Technician');assert.equal(technician.attributes.email,'technician@example.test');
 for(const [key,value] of Object.entries({label:'Workshop',street1:'2 Test Street',city:'Boston',region:'MA',postalCode:'02110'}))assert.equal(technician.attributes.origin[key],value);
 assert.equal(technician.attributes.origin.timezone,'UTC');assert.equal(technician.attributes.radiusMiles,25);
 assert.deepEqual(technician.attributes.services,['tuning']);assert.deepEqual(technician.attributes.forms,['grand']);
 assert.deepEqual(technician.attributes.availability,[],'Incomplete local weekday must never become persisted availability');
 console.log(JSON.stringify({source:'real-api-postgresql-spicedb',customerRevision:customer.revision,technicianRevision:technician.revision,partialDraftPersisted:false}));
}else console.log('Fresh real-service profiles confirmed; unauthorized credentials rejected');
