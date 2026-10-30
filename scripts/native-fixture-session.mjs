// Controlled loopback fixture authentication, never imported by application code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const verifier='v'.repeat(64),client='pianotechpros-mobile',redirect='pianotechpros://callback';
const challenge=createHash('sha256').update(verifier).digest('base64url');
async function code(f,changes={}){
 const params=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid profile email',state:'test-state',code_challenge:challenge,code_challenge_method:'S256',...changes});
 return fetch(f.origin+'/oidc/authorize?'+params,{redirect:'manual'});
}
async function token(f,c,changes={}){return fetch(f.origin+'/oidc/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code:c,code_verifier:verifier,...changes})});}
export async function fixtureIdentity(f){const r=await code(f);assert.equal(r.status,303);const u=new URL(r.headers.get('location'));assert.equal(u.searchParams.get('state'),'test-state');return (await (await token(f,u.searchParams.get('code'))).json()).id_token;}
export async function fixtureAPI(f,path,body,session){return fetch(f.origin+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
