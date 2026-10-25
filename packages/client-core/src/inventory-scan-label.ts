import {createInventoryScanLink} from './inventory-scan-link';
import {inventoryScanMatrix} from './inventory-scan-qr';
export type ScanLabelIssue='denied'|'unavailable';
export type ScanLabelState={busy:boolean;issue:ScanLabelIssue|null;value:{link:string;matrix:boolean[][]}|null};
export function createInventoryScanLabel(port:{origin:string;dealerID:string;load(signal:AbortSignal):Promise<{token:string}>;classify(error:unknown):ScanLabelIssue}){
 let state:ScanLabelState={busy:false,issue:null,value:null};let disposed=false;let request:AbortController|null=null;const listeners=new Set<(value:ScanLabelState)=>void>();
 const snapshot=():ScanLabelState=>({...state,value:state.value?{...state.value,matrix:state.value.matrix.map(row=>[...row])}:null});
 function publish(value:ScanLabelState){state=value;for(const listener of listeners)listener(snapshot());}
 return {snapshot,subscribe(listener:(value:ScanLabelState)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
 async load(){if(disposed||state.busy)return;const current=new AbortController();request=current;const active=()=>!disposed&&request===current&&!current.signal.aborted;publish({busy:true,issue:null,value:null});if(!active())return;
 try{const label=await port.load(current.signal);if(!active())return;const link=createInventoryScanLink(port.origin,port.dealerID,label.token),matrix=inventoryScanMatrix(port.origin,port.dealerID,label.token);publish({busy:false,issue:null,value:{link,matrix}});}
 catch(error){if(active())publish({busy:false,issue:port.classify(error),value:null});}
 finally{if(active())request=null;}
 },dispose(){disposed=true;request?.abort();request=null;publish({busy:false,issue:null,value:null});listeners.clear();}};
}

export function inventoryScanLabelTitle(saved:{title?:string;make?:string;model?:string;stock_number?:string}):string{return saved.title||[saved.make,saved.model].filter(Boolean).join(' ')||saved.stock_number||'';}
