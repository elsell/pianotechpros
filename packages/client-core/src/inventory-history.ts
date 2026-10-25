export type InventoryHistoryIssue='denied'|'unavailable'|'protocol_error';
export type InventoryHistoryState<T>={items:T[];busy:boolean;issue:InventoryHistoryIssue|null;nextCursor?:string;operation:'latest'|'older';loaded:boolean};
export function createInventoryHistory<T extends {revision:number}>(port:{list(cursor: string|undefined,signal:AbortSignal):Promise<{items:T[];nextCursor?:string}>;classify(error:unknown):InventoryHistoryIssue}){
 let state:InventoryHistoryState<T>={items:[],busy:false,issue:null,operation:'latest',loaded:false};let disposed=false;let controller:AbortController|null=null;
 const listeners=new Set<(state:InventoryHistoryState<T>)=>void>();
 // History entries are bounded, validated JSON from the history adapter.
 const copyItems=(items:T[]):T[]=>JSON.parse(JSON.stringify(items)) as T[];
 const snapshot=():InventoryHistoryState<T>=>({...state,items:copyItems(state.items)});
 function publish(change:Partial<InventoryHistoryState<T>>){state={...state,...change};for(const listener of listeners)listener(snapshot());}
 async function load(operation:'latest'|'older'){
  if(disposed||state.busy||operation==='older'&&!state.nextCursor)return;
  const cursor=operation==='older'?state.nextCursor:undefined;
  const before=operation==='older'?state.items.at(-1)?.revision:undefined;
  const request=new AbortController();controller=request;
  const current=()=>!disposed&&controller===request&&!request.signal.aborted;
  publish({busy:true,issue:null,operation});if(!current())return;
  try{
   const page=await port.list(cursor,request.signal);if(!current())return;
   let prior=before??Number.MAX_SAFE_INTEGER+1;
   if(!Array.isArray(page.items)||page.items.length>20||page.items.some(item=>{if(!Number.isSafeInteger(item.revision)||item.revision<1||item.revision>=prior)return true;prior=item.revision;return false;})||page.nextCursor!==undefined&&(typeof page.nextCursor!=='string'||!page.nextCursor||page.nextCursor.length>4096||page.nextCursor===cursor||!page.items.length||prior===1)){publish({issue:'protocol_error'});return;}
   publish({items:copyItems(page.items),nextCursor:page.nextCursor,loaded:true});
  }catch(error){if(current()){const issue=port.classify(error);publish(issue==='denied'?{items:[],nextCursor:undefined,issue,loaded:false}:{issue});}}
  finally{if(current()){controller=null;publish({busy:false});}}
 }
 return {snapshot,subscribe(listener:(state:InventoryHistoryState<T>)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},latest:()=>load('latest'),older:()=>load('older'),retry:()=>load(state.operation),dispose(){disposed=true;controller?.abort();controller=null;publish({items:[],nextCursor:undefined,busy:false,issue:null,loaded:false});listeners.clear();}};
}
