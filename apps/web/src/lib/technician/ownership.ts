import type {TechnicianWorkspaceOwnership} from '@pianotechpros/client-core';

// The callback remains pending for the entire editor lifetime, across tabs.
export const browserTechnicianOwnership:TechnicianWorkspaceOwnership=Object.freeze({
 async acquire(key:string){
  if(typeof key!=='string'||!key||key.length>2048||!globalThis.navigator?.locks)throw Error('technician_ownership_unavailable');
  let unlock!:()=>void;
  const held=new Promise<void>(resolve=>{unlock=resolve;});
  let grant!:(acquired:boolean)=>void;
  const acquired=new Promise<boolean>(resolve=>{grant=resolve;});
  const released=navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},async lock=>{
   grant(lock!==null);
   if(lock)await held;
  });
  void released.catch(()=>{grant(false);});
  if(!await acquired){await released.catch(()=>{throw Error('technician_ownership_unavailable');});return null;}
  return Object.freeze({async release(){unlock();await released;}});
 }
});
