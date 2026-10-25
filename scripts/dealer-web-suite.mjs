import {createServer} from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';

async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
const apiPort=await freePort(),webPort=await freePort();
const webURL=`http://127.0.0.1:${webPort}`;
const env={...process.env,PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${apiPort}`,DEALER_WEB_URL:webURL,DEALER_ACCEPTANCE_API_PORT:String(apiPort)};
const web=spawn('pnpm',['--dir','apps/web','dev','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{env,detached:true,stdio:['ignore','pipe','pipe']});
let log='',test;
for(const output of [web.stdout,web.stderr])output.on('data',data=>{log=(log+data).slice(-16000);});
try{
 for(let i=0;i<100;i++){
  if(web.exitCode!==null)throw Error(log);
  try{if((await fetch(webURL,{signal:AbortSignal.timeout(500)})).ok)break;}catch{}
  if(i===99)throw Error(log);await new Promise(resolve=>setTimeout(resolve,200));
 }
 for(const script of ['scripts/private-scan-navigation.test.mjs','scripts/dealer-web-acceptance.mjs','scripts/inventory-scan-web-acceptance.mjs']){
  test=spawn(process.execPath,[script],{env,stdio:'inherit'});
  const [code]=await once(test,'exit');if(code!==0)throw Error(`browser_acceptance_exit_${code}: ${script}\n${log}`);
 }
}finally{
 if(test&&test.exitCode===null)test.kill('SIGTERM');
 try{process.kill(-web.pid,'SIGTERM');}catch{}
}
