import type {InventoryRecoveryScope,ProtectedInventoryDraftStorage} from './inventory-recovery';
import {openPhotoUploadLedger,type PhotoUploadEntry} from './photo-upload-ledger';
import {createSelectedMediaStore} from './selected-media';
export interface PhotoUploadCoordinatorPort {
 scope:InventoryRecoveryScope;active():boolean;now():number;key():string;
 authorize():Promise<void>;lease():Promise<()=>void>;storage():Promise<ProtectedInventoryDraftStorage>;
 sha256(bytes:Uint8Array):Promise<string>;
 target(recordID?:string):Promise<{recordID:string;revision:number}>;
 upload(intent:{recordID:string;revision:number;key:string;bytes:Uint8Array}):Promise<{recordID:string;photoID:string}>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
}
const failed=()=>new Error('photo_upload_failed');
const inactive=()=>new Error('photo_upload_inactive');
export async function openPhotoUploadCoordinator(port:PhotoUploadCoordinatorPort){
 const scope={...port.scope};let disposed=false;let denied=false;let busy=false;let failure=false;let authorizationFailed=false;
 let entries:PhotoUploadEntry[]=[];let tail:Promise<unknown>=Promise.resolve();let disposal:Promise<void>|null=null;
 let release:(()=>void)|undefined;let storage:ProtectedInventoryDraftStorage;
 let ledger:Awaited<ReturnType<typeof openPhotoUploadLedger>>;
 let media:ReturnType<typeof createSelectedMediaStore>;
 function active(){if(disposed||!port.active())throw inactive();}
 async function authorize(){active();try{await port.authorize();}catch(error){authorizationFailed=true;denied=port.classify(error)==='denied';entries=[];throw failed();}active();denied=false;authorizationFailed=false;}
 function snapshot(){return {entries:disposed||denied||!port.active()?[]:entries.map(e=>({...e})),busy:!disposed&&busy,denied,failure};}
 const listeners=new Set<(state:ReturnType<typeof snapshot>)=>void>();
 function notify(){if(!disposed)for(const listener of listeners){try{listener(snapshot());}catch{/* Observers cannot interrupt persistence. */}}}
 async function reopen(){ledger=await openPhotoUploadLedger({scope,storage,now:port.now});active();entries=ledger.snapshot();notify();}
 async function checkpoint(work:Promise<void>){await work;active();entries=ledger.snapshot();notify();}
 try{
  await authorize();release=await port.lease();active();storage=await port.storage();active();
  media=createSelectedMediaStore({scope,storage,sha256:port.sha256});await reopen();
 }catch{release?.();throw failed();}
 function run<T>(work:()=>Promise<T>):Promise<T>{
  const result=tail.then(async()=>{
   active();busy=true;failure=false;let loaded=false;notify();
   try{await authorize();await reopen();loaded=true;const value=await work();active();return value;}
   catch{
    failure=true;
    if(!loaded||denied||authorizationFailed)entries=[];else{try{entries=ledger.snapshot();}catch{entries=[];}}
    throw failed();
   }finally{busy=false;notify();}
  });
  tail=result.catch(()=>{});return result;
 }
 function entry(id:string){const found=ledger.snapshot().find(e=>e.id===id);if(!found)throw failed();return found;}
 async function cleanup(id:string){await checkpoint(ledger.remove(id));await media.remove(id);active();await checkpoint(ledger.forget(id));}
 function copy(source:Uint8Array){if(!(source instanceof Uint8Array)||source.byteLength<1||source.byteLength>20*1024*1024)throw failed();return new Uint8Array(source);}
 return Object.freeze({
  snapshot,
  subscribe(listener:(state:ReturnType<typeof snapshot>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  select(source:Uint8Array):Promise<string>{
   let bytes:Uint8Array;try{bytes=copy(source);}catch{return Promise.reject(failed());}
   return run(async()=>{const id=port.key();await checkpoint(ledger.reserve(id,bytes.length,port.key()));await media.put(id,bytes);active();await checkpoint(ledger.ready(id));return id;});
  },
  resume(id:string,source:Uint8Array):Promise<void>{
   let bytes:Uint8Array;try{bytes=copy(source);}catch{return Promise.reject(failed());}
   return run(async()=>{const e=entry(id);if(e.state!=='reserved'||e.size!==bytes.length)throw failed();await media.put(id,bytes);active();await checkpoint(ledger.ready(id));});
  },
  upload(id:string):Promise<{recordID:string;photoID:string}>{
   return run(async()=>{
    let e=entry(id);
    if((e.state==='acknowledged'||e.state==='removing')&&e.photoID&&e.recordID){
     const result={recordID:e.recordID,photoID:e.photoID};await cleanup(id);return result;
    }
    if(!['reserved','ready','attempted'].includes(e.state))throw failed();
    const bytes=await media.read(id);active();if(!bytes||bytes.length!==e.size)throw failed();
    if(e.state==='reserved'){await checkpoint(ledger.ready(id));e=entry(id);}
    if(e.state==='ready'){
     let target:{recordID:string;revision:number};
     try{target=await port.target(e.recordID??(scope.recordID==='@capture'?undefined:scope.recordID));}
     catch(error){if(port.classify(error)==='denied'){denied=true;entries=[];}throw failed();}
     active();
     await checkpoint(ledger.attempt(id,target.recordID,target.revision));e=entry(id);
    }
    await authorize();active();
    let result:{recordID:string;photoID:string};
    try{result=await port.upload({recordID:e.recordID!,revision:e.expectedRevision!,key:e.key,bytes});}
    catch(error){
     active();const kind=port.classify(error);
     if(kind==='denied'){denied=true;entries=[];}
     if(kind==='conflict')await checkpoint(ledger.conflict(id));
     if(kind==='rejected')await checkpoint(ledger.reject(id));
     throw failed();
    }
    active();
    if(result.recordID!==e.recordID||typeof result.photoID!=='string'||!result.photoID||result.photoID.trim()!==result.photoID||result.photoID.length>128)throw failed();
    await checkpoint(ledger.acknowledge(id,result.photoID));await cleanup(id);
    return {recordID:result.recordID,photoID:result.photoID};
   });
  },
  rebase(id:string){return run(async()=>{await checkpoint(ledger.rebase(id,port.key()));});},
  remove(id:string){return run(()=>cleanup(id));},
  refresh(){return run(async()=>{});},
  dispose():Promise<void>{
   if(disposal)return disposal;disposed=true;entries=[];listeners.clear();
   disposal=tail.then(()=>{release?.();release=undefined;});return disposal;
  },
 });
}
