import {createPublicResource} from './public-resource';
export type PublicListingResourceState<T,R>={value:T|null;loading:boolean;failure:boolean;related:R[];relatedLoading:boolean;relatedFailure:boolean};
/** Primary publication readiness never depends on optional related content. */
export function createPublicListingResource<T,R>(load:(signal:AbortSignal)=>Promise<T>,loadRelated:(value:T,signal:AbortSignal)=>Promise<R[]>){
 const primary=createPublicResource(load);
 const related=createPublicResource(signal=>{
  const value=primary.snapshot().value;
  if(value===null)return Promise.resolve([] as R[]);
  return loadRelated(value,signal);
 });
 let disposed=false,generation=0;
 const listeners=new Set<(state:PublicListingResourceState<T,R>)=>void>();
 const snapshot=():PublicListingResourceState<T,R>=>{
  const main=primary.snapshot(),extra=related.snapshot();
  return {...main,related:main.value===null?[]:extra.value??[],relatedLoading:main.value!==null&&extra.loading,relatedFailure:main.value!==null&&extra.failure};
 };
 const emit=()=>{if(!disposed)for(const listener of listeners)listener(snapshot());};
 const stopPrimary=primary.subscribe(emit),stopRelated=related.subscribe(emit);
 async function refresh(){
  if(disposed)return;
  const ticket=++generation;related.clear();
  if(disposed||ticket!==generation)return;
  await primary.refresh();
  if(!disposed&&ticket===generation&&primary.snapshot().value!==null)void related.refresh();
 }
 function clear(){generation++;primary.clear();related.clear();}
 return Object.freeze({snapshot,refresh,clear,
  subscribe(listener:(state:PublicListingResourceState<T,R>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  dispose(){disposed=true;generation++;stopPrimary();stopRelated();primary.dispose();related.dispose();listeners.clear();},
 });
}
