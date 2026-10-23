interface RenderCachePort {list():readonly string[];owns(path:string):boolean;remove(path:string):void}
/** The dedicated render cache is exclusively used through this serial adapter. */
export function createPhotoRenderScope(port:RenderCachePort) {
 let tail:Promise<unknown>=Promise.resolve();
 return {
  run<T>(work:(capture:()=>void)=>Promise<T>,active:()=>boolean):Promise<T>{
   const operation=tail.then(async()=>{
    let before:Set<string>|undefined;
    try {
     let result:T;
     try {
      result=await work(()=>{if(before)throw new Error('native_photo_unavailable');before=new Set(port.list());});
     } finally {
      if(before){
       let failed=false;
       for(const path of port.list()){
        if(!before.has(path)&&port.owns(path))try{port.remove(path);}catch{failed=true;}
       }
       if(failed)throw new Error('native_photo_unavailable');
      }
     }
     if(!active())throw new Error('native_photo_inactive');
     return result;
    }catch(error){
     if(error instanceof Error&&['native_photo_invalid','native_photo_inactive','native_photo_unavailable'].includes(error.message))throw error;
     throw new Error('native_photo_unavailable');
    }
   });
   tail=operation.catch(()=>{});return operation;
  },
 };
}
