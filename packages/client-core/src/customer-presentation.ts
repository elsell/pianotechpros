type Resource={dispose():void;cleanup():Promise<void>};
/** Serializes presentation restarts without releasing ownership before cleanup. */
export function createCustomerPresentationLifetime(){
 let tail:Promise<void>=Promise.resolve();
 const retired=new Set<Resource>();
 async function drain(){for(const resource of retired){await resource.cleanup();retired.delete(resource);}}
 return Object.freeze({
  start<T extends Resource>(port:{open(active:()=>boolean):Promise<T|null>;ready(resource:T):void;failed(error:unknown):void}){
   let active=true,resource:T|null=null;
   const retire=()=>{if(resource){resource.dispose();retired.add(resource);resource=null;}};
   tail=tail.then(async()=>{
    await drain();if(!active)return;
    resource=await port.open(()=>active);
    if(!active){retire();return;}
    if(resource)port.ready(resource);
   }).catch(error=>{if(active)port.failed(error);});
   return ()=>{if(!active)return;active=false;retire();tail=tail.then(drain).catch(()=>{/* Retain failed cleanup for explicit restart. */});};
  },
 });
}
