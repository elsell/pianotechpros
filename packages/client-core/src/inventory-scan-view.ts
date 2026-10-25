import {parseInventoryScanLink,type InventoryScanTarget} from './inventory-scan-link';
export type InventoryScanIssue='invalid'|'denied'|'unavailable';
export type InventoryScanState<T>={record:T|null;busy:boolean;issue:InventoryScanIssue|null};
export function createInventoryScanView<T extends {id:string;dealer_id:string}>(port:{
 origin:string;
 resolve(dealerID:string,token:string,signal:AbortSignal):Promise<{dealer_id:string;record_id:string}>;
 read(dealerID:string,recordID:string,signal:AbortSignal):Promise<T>;
 classify(error:unknown):'denied'|'unavailable';
}){
 let state:InventoryScanState<T>={record:null,busy:false,issue:null};let target:InventoryScanTarget|null=null;
 let disposed=false;let controller:AbortController|null=null;const listeners=new Set<(state:InventoryScanState<T>)=>void>();
 const snapshot=():InventoryScanState<T>=>({...state,record:state.record?JSON.parse(JSON.stringify(state.record)) as T:null});
 function publish(value:InventoryScanState<T>){state=value;for(const listener of listeners)listener(snapshot());}
 function cancel(){controller?.abort();controller=null;}
 async function load(){
  if(disposed||!target)return;
  cancel();const request=new AbortController();controller=request;const currentTarget=target;
  const active=()=>!disposed&&controller===request&&!request.signal.aborted;
  publish({record:null,busy:true,issue:null});if(!active())return;
  try{
   const resolved=await port.resolve(currentTarget.dealerID,currentTarget.token,request.signal);if(!active())return;
   if(resolved.dealer_id!==currentTarget.dealerID||!resolved.record_id||! /^[A-Za-z0-9_-]{1,128}$/.test(resolved.record_id))throw Error('scan_scope_mismatch');
   const record=await port.read(resolved.dealer_id,resolved.record_id,request.signal);if(!active())return;
   if(record.dealer_id!==resolved.dealer_id||record.id!==resolved.record_id)throw Error('scan_scope_mismatch');
   publish({record:JSON.parse(JSON.stringify(record)) as T,busy:false,issue:null});
  }catch(error){if(active()){const issue=port.classify(error);if(issue==='denied')target=null;publish({record:null,busy:false,issue});}}
  finally{if(active())controller=null;}
 }
 return {snapshot,subscribe(listener:(state:InventoryScanState<T>)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
 async open(link:string){if(disposed)return;cancel();target=null;try{target=parseInventoryScanLink(port.origin,link);}catch{publish({record:null,busy:false,issue:'invalid'});return;}await load();},
 retry:load,
 dispose(){disposed=true;cancel();target=null;publish({record:null,busy:false,issue:null});listeners.clear();},
 };
}
