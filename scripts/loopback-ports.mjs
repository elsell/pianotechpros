import {createServer} from 'node:net';
import {once} from 'node:events';

// Hold the complete set so ephemeral allocation cannot recycle an earlier port.
export async function reserveLoopbackPorts(count){
 if(!Number.isSafeInteger(count)||count<1||count>16)throw new RangeError('invalid_port_count');
 const reservations=[];
 try{
  for(let i=0;i<count;i++){
   const server=createServer();
   server.listen(0,'127.0.0.1');await once(server,'listening');
   let released;
   reservations.push({port:server.address().port,release:()=>released??=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))});
  }
  return reservations;
 }catch(error){
  await Promise.all(reservations.map(value=>value.release()));
  throw error;
 }
}
