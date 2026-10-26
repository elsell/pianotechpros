import {createNativeInventoryFixture} from './native-inventory-fixture.mjs';
// Controlled loopback presentation fixture. Never imported by application code.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
const client='pianotechpros-mobile',callback='pianotechpros://callback';
const opaque=()=>randomBytes(32).toString('base64url');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export async function startNativeUIFixture({port=0,now=Date.now,onAuthResponse=()=>{},inventory=false}={}){
 const inventoryRoutes=inventory?createNativeInventoryFixture(now):null;
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'native-ui-fixture',use:'sig',alg:'RS256'};
 const codes=new Map(),identities=new Map(),sessions=new Map(),profiles=new Map(),creations=new Map();let origin;
 const prune=()=>{for(const map of [codes,identities,sessions])for(const [key,value]of map)if(value.expires<=now())map.delete(key);};
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const body=async()=>{
   if(Number(req.headers['content-length']??0)>65536)throw {status:413};
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw {status:413};chunks.push(chunk);}return Buffer.concat(chunks).toString();
  };
  try{
   prune();const url=new URL(req.url,origin),path=url.pathname;
   const stage=new Map([['/oidc/.well-known/openid-configuration','discovery'],['/oidc/authorize','authorization'],['/oidc/token','token'],['/v1/sessions','session']]).get(path);
   if(stage)res.once('finish',()=>onAuthResponse({stage,status:res.statusCode}));
   if(req.method==='GET'&&path==='/oidc/.well-known/openid-configuration')return send(200,{issuer:origin+'/oidc',authorization_endpoint:origin+'/oidc/authorize',token_endpoint:origin+'/oidc/token',jwks_uri:origin+'/oidc/keys',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});
   if(req.method==='GET'&&path==='/oidc/keys')return send(200,{keys:[jwk]});
   if(req.method==='GET'&&path==='/oidc/authorize'){
    const p=url.searchParams,challenge=p.get('code_challenge'),state=p.get('state');
    if(p.get('client_id')!==client||p.get('redirect_uri')!==callback||p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256'||!/^[-_A-Za-z0-9]{43}$/.test(challenge??'')||!state||state.length>1024)return send(400,{error:'invalid_request'});
    if(codes.size>=128)return send(429,{error:'temporarily_unavailable'});
    const code=opaque();codes.set(code,{challenge,nonce:p.get('nonce'),expires:now()+120000});const target=new URL(callback);target.searchParams.set('code',code);target.searchParams.set('state',state);res.writeHead(303,{Location:target.href});res.end();return;
   }
   if(req.method==='POST'&&path==='/oidc/token'){
    const p=new URLSearchParams(await body()),code=p.get('code'),record=codes.get(code);codes.delete(code);const verifier=p.get('code_verifier')??'';
    if(!record||p.get('grant_type')!=='authorization_code'||p.get('client_id')!==client||p.get('redirect_uri')!==callback||!/^[-._~A-Za-z0-9]{43,128}$/.test(verifier)||createHash('sha256').update(verifier).digest('base64url')!==record.challenge)return send(400,{error:'invalid_grant'});
    if(identities.size>=128)return send(429,{error:'temporarily_unavailable'});
    const issued=Math.floor(now()/1000),claims={iss:origin+'/oidc',aud:client,sub:'native-ui-owner',iat:issued,exp:issued+300,jti:opaque(),email:'owner@example.test',name:'Native UI Owner',...(record.nonce?{nonce:record.nonce}:{})};
    const unsigned=[{alg:'RS256',kid:jwk.kid,typ:'JWT'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');const idToken=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');identities.set(idToken,{expires:(issued+300)*1000});return send(200,{id_token:idToken,access_token:opaque(),token_type:'Bearer',expires_in:300});
   }
   if(req.method==='POST'&&path==='/v1/sessions'){
    const input=JSON.parse(await body());if(!object(input)||typeof input.identityToken!=='string')return send(400,{code:'bad_request'});
    if(!identities.has(input.identityToken))return send(401,{code:'invalid_credential'});identities.delete(input.identityToken);
    if(sessions.size>=128)return send(429,{code:'rate_limited'});
    const token=opaque(),expires=now()+7200000;sessions.set(token,{expires});return send(201,{data:{token,expiresAt:new Date(expires).toISOString()}});
   }
   const bearer=req.headers.authorization?.replace(/^Bearer /,''),session=sessions.get(bearer);
   if(!session||req.headers.authorization!=='Bearer '+bearer)return send(401,{code:'unauthenticated'});
   if(req.method==='GET'&&path==='/v1/me')return send(200,{data:{id:'native-ui-owner',email:'owner@example.test',displayName:'Native UI Owner'}});
   if(inventoryRoutes?.(req,url,send))return;
   if(req.method==='GET'&&path==='/v1/dealers')return send(200,{data:[],meta:{}});
   if(req.method==='POST'&&path==='/v1/session/refresh'){sessions.delete(bearer);const token=opaque();sessions.set(token,session);return send(200,{data:{token,expiresAt:new Date(session.expires).toISOString()}});}
   const match=/^\/v1\/(customer|technician)-profile(\/timezones)?$/.exec(path);
   if(match){
    const domain=match[1],saved=profiles.get(domain);
    if(match[2])return req.method==='GET'?send(200,{data:{names:['America/Chicago','Europe/Madrid','UTC']}}):send(405,{code:'bad_request'});
    if(req.method==='GET')return saved?send(200,{data:saved}):send(404,{code:'not_found'});
    if(!['POST','PUT'].includes(req.method))return send(405,{code:'bad_request'});
    const input=JSON.parse(await body());if(!object(input)||!object(input.attributes))return send(400,{code:'bad_request'});
    // This fake records presentation commands; real domain validation lives in API integration tests.
    if(req.method==='POST'){
     const key=req.headers['idempotency-key'];if(typeof key!=='string'||!key||key.length>128)return send(400,{code:'bad_request'});
     const prior=creations.get(domain);if(prior?.key===key)return JSON.stringify(prior.attributes)===JSON.stringify(input.attributes)?send(201,{data:prior.result}):send(409,{code:'idempotency_conflict'});
     if(saved)return send(409,{code:'conflict'});
     const stamp=new Date(now()).toISOString(),result={id:domain+'-ui-profile',revision:1,createdAt:stamp,updatedAt:stamp,attributes:input.attributes};profiles.set(domain,result);creations.set(domain,{key,attributes:input.attributes,result});return send(201,{data:result});
    }
    if(!saved)return send(404,{code:'not_found'});
    if(input.expectedRevision!==saved.revision)return send(409,{code:'conflict'});
    if(JSON.stringify(input.attributes)===JSON.stringify(saved.attributes))return send(200,{data:saved});
    const result={...saved,revision:saved.revision+1,updatedAt:new Date(now()).toISOString(),attributes:input.attributes};profiles.set(domain,result);return send(200,{data:result});
   }
   send(404,{code:'not_found'});
  }catch(error){if(!res.headersSent)send(error?.status===413?413:400,{code:'bad_request'});else res.end();}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.listen(port,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 return {origin,close:async()=>{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
