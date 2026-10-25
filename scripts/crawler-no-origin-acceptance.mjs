import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';

let reads=0;
const api=createServer((_req,res)=>{reads++;res.statusCode=503;res.end();});
api.listen(0,'127.0.0.1');await once(api,'listening');
const env={...process.env,HOST:'127.0.0.1',PORT:'5188',PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${api.address().port}`};
delete env.PIANOTECHPROS_PUBLIC_WEB_ORIGIN;
const built=process.env.WEB_ACCEPTANCE_BUILT==='1';
const web=spawn(built?process.execPath:'pnpm',built?['apps/web/build/index.js']:['--dir','apps/web','dev','--port','5188','--strictPort'],{env,stdio:['ignore','pipe','pipe'],detached:true});
let log='';web.stdout.on('data',d=>log+=d);web.stderr.on('data',d=>log+=d);
const origin='http://127.0.0.1:5188';
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(web.exitCode!==null)throw Error(log);
  try{if((await fetch(origin+'/robots.txt')).ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert.ok(ready,log);
 const robots=await fetch(origin+'/robots.txt');assert.equal(await robots.text(),'User-agent: *\nDisallow: /\n');assert.equal(robots.headers.get('cache-control'),'no-store');
 for(const path of ['/sitemap.xml','/sitemap-showroom-workshop.xml','/llms.txt']){
  const response=await fetch(origin+path);assert.equal(response.status,503,path);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.equal(reads,0,'missing origin must fail before directory reads');
 console.log('Missing public origin disallows crawlers and prevents discovery reads');
}finally{
 api.close();
 if(web.exitCode===null){process.kill(-web.pid,'SIGTERM');await once(web,'exit');}
}
