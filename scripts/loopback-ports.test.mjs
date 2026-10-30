import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {reserveLoopbackPorts} from './loopback-ports.mjs';
const bind=port=>new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
const close=server=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
const probe=async port=>{const server=await bind(port);await close(server);};
test('pair stays distinct and reserved until each consumer is ready',async()=>{
 const reservations=await reserveLoopbackPorts(2);
 try{
  assert.equal(new Set(reservations.map(value=>value.port)).size,2);
  for(const reservation of reservations)await assert.rejects(probe(reservation.port),{code:'EADDRINUSE'});
  await reservations[0].release();
  const consumer=await bind(reservations[0].port);
  try{await assert.rejects(probe(reservations[1].port),{code:'EADDRINUSE'});}finally{await close(consumer);}
 }finally{await Promise.all(reservations.map(value=>value.release()));}
 for(const reservation of reservations){const consumer=await bind(reservation.port);await close(consumer);}
});
