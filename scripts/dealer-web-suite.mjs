import {reserveLoopbackPorts} from './loopback-ports.mjs';
import {once} from 'node:events';
import {spawn} from 'node:child_process';

const [apiReservation,webReservation]=await reserveLoopbackPorts(2);
const apiPort=apiReservation.port,webPort=webReservation.port;
const webURL=`http://127.0.0.1:${webPort}`;
const env={...process.env,PIANOTECHPROS_APP_ENV:'development',PIANOTECHPROS_API_URL:`http://127.0.0.1:${apiPort}`,DEALER_WEB_URL:webURL,DEALER_ACCEPTANCE_API_PORT:String(apiPort)};
let log='',test,web;
try{
 await webReservation.release();
 web=spawn('pnpm',['--dir','apps/web','dev','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{env,detached:true,stdio:['ignore','pipe','pipe']});
for(const output of [web.stdout,web.stderr])output.on('data',data=>{log=(log+data).slice(-16000);});
 await once(web,'spawn');
 for(let i=0;i<100;i++){
  if(web.exitCode!==null)throw Error(log);
  try{if((await fetch(webURL,{signal:AbortSignal.timeout(500)})).ok)break;}catch{}
  if(i===99)throw Error(log);await new Promise(resolve=>setTimeout(resolve,200));
 }
 for(const script of ['scripts/private-scan-navigation.test.mjs','scripts/dealer-web-acceptance.mjs','scripts/inventory-scan-web-acceptance.mjs']){
  if(script==='scripts/dealer-web-acceptance.mjs')await apiReservation.release();
  test=spawn(process.execPath,[script],{env,stdio:'inherit'});
  const [code]=await once(test,'exit');if(code!==0)throw Error(`browser_acceptance_exit_${code}: ${script}\n${log}`);
 }
}finally{
 await Promise.all([apiReservation.release(),webReservation.release()]);
 if(test&&test.exitCode===null)test.kill('SIGTERM');
 try{process.kill(-web.pid,'SIGTERM');}catch{}
}
