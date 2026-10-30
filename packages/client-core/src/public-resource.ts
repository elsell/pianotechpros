export type PublicResourceState<T>={value:T|null;loading:boolean;failure:boolean};
/** Anonymous, nonpersistent reads. Refresh never keeps stale publication data. */
export function createPublicResource<T>(load:(signal:AbortSignal)=>Promise<T>){
 let value:T|null=null,loading=false,failure=false,disposed=false,generation=0,controller:AbortController|null=null;
 const listeners=new Set<(state:PublicResourceState<T>)=>void>();
 const snapshot=():PublicResourceState<T>=>({value:value===null?null:JSON.parse(JSON.stringify(value)),loading,failure});
 const emit=()=>{if(!disposed)for(const listener of listeners)listener(snapshot());};
 function clear(){generation++;controller?.abort();controller=null;value=null;loading=false;failure=false;emit();}
 async function refresh(retainWhileLoading=false){
  if(disposed)return;generation++;controller?.abort();const ticket=generation,request=new AbortController();controller=request;if(!retainWhileLoading)value=null;loading=true;failure=false;emit();
  try{if(disposed||generation!==ticket)return;const result=await load(request.signal);if(!disposed&&generation===ticket)value=JSON.parse(JSON.stringify(result));}
  catch{if(!disposed&&generation===ticket){value=null;failure=true;}}
  finally{if(!disposed&&generation===ticket){controller=null;loading=false;emit();}}
 }
 return Object.freeze({snapshot,refresh,clear,subscribe(listener:(state:PublicResourceState<T>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},dispose(){disposed=true;clear();listeners.clear();}});
}
