import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createDealerBannerApiClient} from './dealer-banner.js';
import {DealerClientError} from './dealer.js';
const profile={id:'shop',revision:2,name:'Shop',slug:'shop',email:'shop@example.com',accent_color:'#123456',showroom_published:true};
const banner={id:'asset',width:1200,height:600};
const jpeg=new Uint8Array([255,216,255,224,0,2,255,217]);
test('banner transport snapshots binary bytes, uses current session and sends revisioned removal',async t=>{
 const seen:Array<{method:string;url:string;body:Buffer;token?:string;key?:string}>=[];
 const server=createServer(async(req,res)=>{
 const parts:Buffer[]=[];for await(const chunk of req)parts.push(chunk);
 seen.push({method:req.method!,url:req.url!,body:Buffer.concat(parts),token:req.headers.authorization,key:req.headers['idempotency-key'] as string});
 if(req.url!.endsWith('/image')){res.setHeader('Content-Type','image/jpeg');res.end(jpeg);return;}
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({data:{profile,banner:req.method==='DELETE'?null:banner},...(req.method==='POST'?{meta:{bannerID:'asset',replay:false}}:{})}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const address=server.address();assert.ok(address&&typeof address!=='string');
 let token='first',release!:()=>void;let gate:Promise<void>|undefined;
 const api=createDealerBannerApiClient(`http://127.0.0.1:${address.port}`,async()=>{await gate;return token;});
 assert.deepEqual(await api.get('shop'),{profile,banner});
 gate=new Promise<void>(r=>release=r);const bytes=jpeg.slice();const uploading=api.upload('shop',bytes,'banner-intent-001',1);bytes.fill(0);token='rotated';release();
 assert.equal((await uploading).bannerID,'asset');assert.deepEqual(seen[1].body,Buffer.from(jpeg));assert.equal(seen[1].token,'Bearer rotated');assert.equal(seen[1].key,'banner-intent-001');
 assert.deepEqual(await api.image('shop','asset'),jpeg);
 assert.equal((await api.remove('shop',1)).banner,null);assert.equal(seen.at(-1)?.method,'DELETE');assert.match(seen.at(-1)!.url,/expectedRevision=1/);
});
for(const scenario of ['scope','revision','metadata','dimensions','fresh-missing','replay-removed','denied','network','bad-json','image-type','image-bytes'] as const){
 test(`banner adapter validates ${scenario}`,async t=>{
 const server=createServer((_req,res)=>{
 if(scenario==='network'){res.destroy();return;}
 res.setHeader('Content-Type','application/json');
 if(scenario==='denied'){res.statusCode=404;res.end(JSON.stringify({code:'not_found',detail:'PRIVATE'}));return;}
 if(scenario==='bad-json'){res.end('PRIVATE');return;}
 if(scenario.startsWith('image-')){res.setHeader('Content-Type',scenario==='image-type'?'text/html':'image/jpeg');res.end('PRIVATE');return;}
 const data:any={profile:{...profile},banner:{...banner}},meta={bannerID:'asset',replay:false};
 if(scenario==='scope')data.profile.id='other';if(scenario==='revision')data.profile.revision=1;
 if(scenario==='metadata')data.banner.sha256='PRIVATE';if(scenario==='dimensions')data.banner.width=0;
 if(scenario==='fresh-missing'||scenario==='replay-removed'){data.banner=null;meta.replay=scenario==='replay-removed';}
 res.end(JSON.stringify({data,meta}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());const address=server.address();assert.ok(address&&typeof address!=='string');
 const api=createDealerBannerApiClient(`http://127.0.0.1:${address.port}`,()=> 'session');
 const result=scenario.startsWith('image-')?api.image('shop','asset'):api.upload('shop',jpeg,'banner-intent-001',1);
 if(scenario==='replay-removed'){assert.equal((await result as any).banner,null);}
 else await assert.rejects(result,(e:unknown)=>e instanceof DealerClientError&&!JSON.stringify(e).includes('PRIVATE'));
 });
}
