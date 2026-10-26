import {openPhotoUploadCoordinator,type PhotoUploadCoordinatorPort} from './photo-upload-coordinator';
export interface InventoryPhotoItem {id:string;altText:string}
export interface InventoryPhotoCollection {record:{id:string;dealer_id:string;revision:number};photos:InventoryPhotoItem[]}
export interface InventoryPhotoWorkspacePort {
 capture?:{stage(bytes:Uint8Array):Promise<string|null>;pending():{id:string}|null;expired?():boolean;discard():Promise<void>};
 userID:string;dealerID:string;active():boolean;recordID():string;ensureRecord():Promise<string|null>;
 withMediaMutation<T>(work:()=>Promise<T>):Promise<T>;
 now():number;key():string;lease(recordID:string):Promise<()=>void>;
 storage:PhotoUploadCoordinatorPort['storage'];sha256:PhotoUploadCoordinatorPort['sha256'];classify:PhotoUploadCoordinatorPort['classify'];
 list(recordID:string):Promise<InventoryPhotoCollection>;
 upload(recordID:string,bytes:Uint8Array,key:string,revision:number):Promise<InventoryPhotoCollection&{photoID:string}>;
 reorder(recordID:string,ids:string[],revision:number):Promise<InventoryPhotoCollection>;
 describe(recordID:string,photoID:string,altText:string,revision:number):Promise<InventoryPhotoCollection>;
 remove(recordID:string,photoID:string,revision:number):Promise<InventoryPhotoCollection>;
}
const unavailable=()=>new Error('inventory_photos_unavailable');
/** Framework-independent photo interaction orchestration; ports own transport and platform media. */
export function createInventoryPhotoWorkspace(port:InventoryPhotoWorkspacePort){
 let disposed=false;let denied=false;let pending=0;let failure:null|'conflict'|'uncertain'=null;
 let photos:InventoryPhotoItem[]=[];let boundID='';let coordinator:Awaited<ReturnType<typeof openPhotoUploadCoordinator>>|null=null;
 let unsubscribe=()=>{};let tail:Promise<unknown>=Promise.resolve();let disposal:Promise<void>|null=null;
 const listeners=new Set<(value:ReturnType<typeof snapshot>)=>void>();
 const alive=()=>!disposed&&port.active()&&(!boundID||port.recordID()===boundID);
 function active(){if(!alive())throw unavailable();}
 function snapshot(){const hidden=!alive()||denied;const upload=coordinator?.snapshot();return {
  capturePending:hidden?false:!!port.capture?.pending(),
  photos:hidden?[]:photos.map(p=>({...p})),entries:hidden?[]:upload?.entries??[],
  busy:alive()&&pending>0,denied,failure,
  expiredSelections:hidden?0:(upload?.expiredSelections??0)+(port.capture?.expired?.()?1:0),uncertainExpirations:hidden?0:upload?.uncertainExpirations??0,
 };}
 function notify(){if(!disposed)for(const listener of listeners){try{listener(snapshot());}catch{/* Presentation cannot interrupt durable work. */}}}
 function check(value:InventoryPhotoCollection,id:string){
  active();
  if(value.record.id!==id||value.record.dealer_id!==port.dealerID||!Number.isSafeInteger(value.record.revision)||value.record.revision<1||!Array.isArray(value.photos)||value.photos.length>50||new Set(value.photos.map(p=>p.id)).size!==value.photos.length||value.photos.some(p=>typeof p.id!=='string'||!p.id||p.id.trim()!==p.id||typeof p.altText!=='string'||[...p.altText].length>240))throw unavailable();
  return {...value,record:{...value.record},photos:value.photos.map(p=>({id:p.id,altText:p.altText}))};
 }
 async function read(id:string){active();return check(await port.list(id),id);}
 function accept(value:InventoryPhotoCollection,id:string){photos=check(value,id).photos;notify();}
 async function connect(id:string){
  active();if(coordinator){if(boundID!==id)throw unavailable();return coordinator;}
  boundID=id;active();
  const opened=await openPhotoUploadCoordinator({scope:{userID:port.userID,dealerID:port.dealerID,recordID:id},active:alive,now:port.now,key:port.key,
   authorize:async()=>{try{await read(id);}catch(error){if(port.classify(error)==='denied'){denied=true;photos=[];}throw error;}},
   lease:()=>port.lease(id),storage:port.storage,sha256:port.sha256,classify:port.classify,
   target:async target=>{if(target!==id)throw unavailable();const state=await read(id);return {recordID:id,revision:state.record.revision};},
   upload:async intent=>{active();const result=check(await port.upload(id,intent.bytes,intent.key,intent.revision),id) as InventoryPhotoCollection&{photoID:string};return {recordID:result.record.id,photoID:result.photoID};},
  });
  if(!alive()){await opened.dispose();throw unavailable();}coordinator=opened;unsubscribe=opened.subscribe(notify);return opened;
 }
 function run<T>(work:()=>Promise<T>):Promise<T>{
  pending++;notify();const result=tail.then(async()=>{active();failure=null;denied=false;notify();
   try{return await work();}catch(error){if(port.classify(error)==='denied'||coordinator?.snapshot().denied){denied=true;photos=[];}if(!failure)failure='uncertain';throw unavailable();}
  }).finally(()=>{pending--;notify();});tail=result.catch(()=>{});return result;
 }
 async function reload(id:string){try{accept(await read(id),id);}catch(error){if(port.classify(error)==='denied'){denied=true;photos=[];}throw error;}}
 async function upload(id:string,selection:string){
  const uploads=await connect(id);
  try{await port.withMediaMutation(async()=>{active();await uploads.upload(selection);active();});}
  finally{if(alive())await reload(id);}
  active();
 }
 function edit(command:(id:string,current:InventoryPhotoCollection)=>Promise<InventoryPhotoCollection>){
  const expected=photos.map(p=>({...p}));
  return run(async()=>{
   const id=port.recordID();if(!id)throw unavailable();
   try{await port.withMediaMutation(async()=>{
    active();const current=await read(id);
    if(JSON.stringify(current.photos)!==JSON.stringify(expected)){accept(current,id);failure='conflict';throw unavailable();}
    accept(await command(id,current),id);
   });}catch(error){if(port.classify(error)==='conflict')failure='conflict';if(alive()){try{await reload(id);}catch{}}throw error;}
  });
 }
 return Object.freeze({
  snapshot,
  subscribe(listener:(value:ReturnType<typeof snapshot>)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  refresh(){return run(async()=>{const id=port.recordID();if(!id)return;await reload(id);if(port.capture?.pending())return;const uploads=await connect(id);await uploads.refresh();active();});},
  add(source:Uint8Array,transferred?:()=>Promise<void>):Promise<void>{
   if(!(source instanceof Uint8Array)||!source.length||source.length>20*1024*1024)return Promise.reject(unavailable());const bytes=new Uint8Array(source);
   return run(async()=>{if(!port.recordID()&&!port.capture)throw unavailable();const staged=port.capture&&(!port.recordID()||port.capture.pending())?await port.capture.stage(bytes):null;active();if(staged&&transferred){await transferred();active();}const id=await port.ensureRecord();active();if(!id||id!==port.recordID())throw unavailable();const uploads=await connect(id);const selection=staged??await uploads.select(bytes);active();if(!staged&&transferred){await transferred();active();}await upload(id,selection);});
  },
  retryCapture(){return run(async()=>{const selection=port.capture?.pending()?.id;if(!selection)throw unavailable();const id=await port.ensureRecord();active();if(!id)throw unavailable();const uploads=await connect(id);if(uploads.snapshot().entries.some(e=>e.id===selection))await upload(id,selection);else await reload(id);});},
  discardCapture(){return run(async()=>{if(!port.capture)throw unavailable();await port.capture.discard();active();});},
  retry(selection:string){return run(async()=>{const id=port.recordID();if(!id)throw unavailable();const uploads=await connect(id);const entry=uploads.snapshot().entries.find(e=>e.id===selection);if(entry?.state==='removing'&&!entry.photoID)await uploads.remove(selection);else await upload(id,selection);});},
  rebase(selection:string){return run(async()=>{const id=port.recordID();if(!id)throw unavailable();const uploads=await connect(id);await uploads.rebase(selection);active();await upload(id,selection);});},
  discard(selection:string){return run(async()=>{const id=port.recordID();if(!id)throw unavailable();const uploads=await connect(id);await uploads.remove(selection);active();});},
  move(photoID:string,offset:-1|1){return edit(async(id,current)=>{const ids=current.photos.map(p=>p.id);const at=ids.indexOf(photoID);if(at<0||at+offset<0||at+offset>=ids.length)throw unavailable();[ids[at],ids[at+offset]]=[ids[at+offset]!,ids[at]!];return port.reorder(id,ids,current.record.revision);});},
  cover(photoID:string){return edit(async(id,current)=>{if(!current.photos.some(p=>p.id===photoID))throw unavailable();return port.reorder(id,[photoID,...current.photos.filter(p=>p.id!==photoID).map(p=>p.id)],current.record.revision);});},
  describe(photoID:string,altText:string){return edit((id,current)=>port.describe(id,photoID,altText.trim(),current.record.revision));},
  remove(photoID:string){return edit((id,current)=>port.remove(id,photoID,current.record.revision));},
  dispose():Promise<void>{if(disposal)return disposal;disposed=true;photos=[];unsubscribe();listeners.clear();disposal=tail.then(()=>coordinator?.dispose());return disposal;},
 });
}
