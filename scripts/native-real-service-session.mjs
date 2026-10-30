// Read-back acceptance against the actual isolated API, never fixture state.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
export async function realNativeSession(){
const loopback=port=>{assert.match(port,/^[0-9]{4,5}$/);assert.ok(Number(port)>=1024&&Number(port)<=65535);return 'http://127.0.0.1:'+port;};
const origin=loopback(process.env.NATIVE_ACCEPTANCE_IDENTITY_PORT??'18082'),api=loopback(process.env.NATIVE_ACCEPTANCE_API_PORT??'18083');
const boundedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(10000)});
const verifier=randomBytes(48).toString('base64url'),state=randomBytes(24).toString('base64url');
const client='pianotechpros-mobile',redirect='pianotechpros://callback';
const parameters=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid profile email',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
const response=await boundedFetch(origin+'/oidc/authorize?'+parameters,{redirect:'manual'});
assert.equal(response.status,303);
const callback=new URL(response.headers.get('location'));
assert.equal(callback.protocol,'pianotechpros:');assert.equal(callback.hostname,'callback');assert.equal(callback.pathname,'');
assert.equal(callback.searchParams.get('state'),state);
const tokenResponse=await boundedFetch(origin+'/oidc/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier})});
assert.equal(tokenResponse.status,200);
const identity=(await tokenResponse.json()).id_token;
const exchange=await boundedFetch(api+'/v1/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identityToken:identity})});
assert.equal(exchange.status,200);
const session=(await exchange.json()).data.token;
return {origin,api,session,identity,fetch:boundedFetch};
}
