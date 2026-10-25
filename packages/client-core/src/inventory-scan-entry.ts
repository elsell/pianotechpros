import {parseInventoryScanLink} from './inventory-scan-link';
export type InventoryScanEntryState={pending:boolean;version:number;expiresAt:number|null};
/** Ephemeral native continuation. Snapshots deliberately contain no link/token. */
export function createInventoryScanEntry(port:{origin:string;now():number}){
 let value:string|null=null,owner:string|null=null,started=0,expiresAt:number|null=null,version=0;
 const listeners=new Set<(state:InventoryScanEntryState)=>void>();
 function valid(){const now=port.now();return value!==null&&Number.isSafeInteger(now)&&now>=started&&expiresAt!==null&&now<expiresAt;}
 function snapshot():InventoryScanEntryState{return {pending:valid(),version,expiresAt:valid()?expiresAt:null};}
 function notify(){const state=snapshot();for(const listener of listeners)listener(state);}
 function clear(){value=null;owner=null;expiresAt=null;version++;notify();}
 return {snapshot,clear,subscribe(listener:(state:InventoryScanEntryState)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  open(link:string,account:string|null){clear();try{parseInventoryScanLink(port.origin,link);const now=port.now();if(!Number.isSafeInteger(now)||!Number.isSafeInteger(now+600000))return false;value=link;owner=account;started=now;expiresAt=now+600000;notify();return true;}catch{return false;}},
  bind(account:string){if(owner!==null&&owner!==account)clear();else if(valid())owner=account;},
  link(){if(!valid()){if(value!==null)clear();return null;}return value;},
 };
}
