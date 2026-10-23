export const inventoryBrowseStatuses=['active','all','draft','available','reserved','in_service','sold','archived'] as const;
export type InventoryBrowseStatus=typeof inventoryBrowseStatuses[number];
export interface InventoryBrowseFilters{search:string;status:InventoryBrowseStatus}
export interface InventoryBrowserState<T>{items:readonly T[];filters:InventoryBrowseFilters;nextCursor?:string;busy:boolean;failed:'refresh'|'more'|null;denied:boolean}
export function createInventoryBrowser<T extends {id:string}>(port:{copy(row:T):T;accessDenied(error:unknown):boolean;list(filters:InventoryBrowseFilters,cursor?:string):Promise<{items:T[];nextCursor?:string}>}){
 let state:InventoryBrowserState<T>={items:[],filters:{search:'',status:'active'},busy:false,failed:null,denied:false};
 let generation=0;let disposed=false;let pendingMore:Promise<void>|null=null;
 const listeners=new Set<(value:InventoryBrowserState<T>)=>void>();
 const snapshot=():InventoryBrowserState<T>=>({...state,filters:{...state.filters},items:state.items.map(port.copy)});
 function publish(patch:Partial<InventoryBrowserState<T>>){state={...state,...patch};for(const listener of listeners)listener(snapshot());}
 async function read(append:boolean){
  if(disposed||append&&!state.nextCursor)return;
  const current=++generation;const filters={...state.filters};const cursor=append?state.nextCursor:undefined;
  publish({busy:true,failed:null,denied:false});
  try{
   const page=await port.list(filters,cursor);if(disposed||generation!==current)return;
   const rows=new Map((append?state.items:[]).map(row=>[row.id,row]));for(const row of page.items)rows.set(row.id,port.copy(row));
   publish({items:[...rows.values()],nextCursor:page.nextCursor,busy:false,failed:null});
  }catch(error){if(disposed||generation!==current)return;const denied=port.accessDenied(error);publish({busy:false,failed:append?'more':'refresh',denied,...denied?{items:[],nextCursor:undefined}:{}});}
 }
 function refresh(){pendingMore=null;return read(false);}
 function more(){
  if(pendingMore)return pendingMore;if(disposed||state.busy||!state.nextCursor)return Promise.resolve();
  const pending=read(true);pendingMore=pending;void pending.finally(()=>{if(pendingMore===pending)pendingMore=null;});return pending;
 }
 return Object.freeze({snapshot,
  subscribe(listener:(value:InventoryBrowserState<T>)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  refresh,more,
  filter(filters:InventoryBrowseFilters){if(disposed)return Promise.resolve();generation++;pendingMore=null;publish({filters:{...filters,search:filters.search.trim()},items:[],nextCursor:undefined,busy:false,failed:null,denied:false});return read(false);},
  retry(){return state.failed==='more'&&!state.denied?more():refresh();},
  dispose(){disposed=true;generation++;pendingMore=null;state={...state,items:[],nextCursor:undefined,busy:false,failed:null};listeners.clear();},
 });
}
