import type {InventoryRecoveryScope,ProtectedInventoryDraftStorage} from './inventory-recovery';
export type PhotoUploadPhase='reserved'|'ready'|'attempted'|'conflict'|'rejected'|'acknowledged'|'removing';
export interface PhotoUploadEntry {
 id:string;size:number;key:string;createdAt:number;state:PhotoUploadPhase;
 recordID?:string;expectedRevision?:number;photoID?:string;
}
const unavailable=()=>new Error('photo_upload_storage_unavailable');
const invalid=()=>new Error('invalid_photo_upload_transition');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identity=(v:unknown):v is string=>typeof v==='string'&&!!v&&v.trim()===v&&v.length<=128;
const retryKey=(v:unknown):v is string=>typeof v==='string'&&/^[\x21-\x7e]{16,128}$/.test(v);
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const phases=new Set<unknown>(['reserved','ready','attempted','conflict','rejected','acknowledged','removing']);
function validEntries(value:unknown,scope:InventoryRecoveryScope):value is PhotoUploadEntry[]{
 if(!Array.isArray(value)||value.length>50)return false;
 const ids=new Set<string>();const keys=new Set<string>();let size=0;
 for(const e of value){
  if(!object(e)||Object.keys(e).some(k=>!['id','size','key','createdAt','state','recordID','expectedRevision','photoID'].includes(k))||!identity(e.id)||ids.has(e.id)||!retryKey(e.key)||keys.has(e.key)||!safe(e.size)||e.size<1||e.size>20*1024*1024||!safe(e.createdAt)||!phases.has(e.state))return false;
  ids.add(e.id);keys.add(e.key);size+=e.size;
  const target=e.recordID!==undefined;
  if(target&&(!identity(e.recordID)||scope.recordID!=='@capture'&&e.recordID!==scope.recordID))return false;
  if(e.expectedRevision!==undefined&&(!target||!safe(e.expectedRevision)||e.expectedRevision<1))return false;
  if(['attempted','conflict','rejected','acknowledged'].includes(e.state as string)&&(!target||e.expectedRevision===undefined))return false;
  if(e.state==='reserved'&&target)return false;
  if(['reserved','ready'].includes(e.state as string)&&e.expectedRevision!==undefined)return false;
  if(e.state==='acknowledged'&&!identity(e.photoID))return false;
  if(e.photoID!==undefined&&(!identity(e.photoID)||!target||!['acknowledged','removing'].includes(e.state as string)))return false;
 }
 return size<=100*1024*1024;
}
/** Requires current authorization and exclusive scope ownership from its caller. */
export async function openPhotoUploadLedger(port:{scope:InventoryRecoveryScope;storage:ProtectedInventoryDraftStorage;now():number}){
 const scope=Object.freeze({userID:port.scope.userID,dealerID:port.scope.dealerID,recordID:port.scope.recordID});
 if(Object.values(scope).some(v=>!identity(v)))throw unavailable();
 const address=JSON.stringify(['inventory-photo-uploads',1,scope.userID,scope.dealerID,scope.recordID]);
 let entries:PhotoUploadEntry[]=[];
 try{
  const raw=await port.storage.read(address);
  if(raw!==null){
   if(raw.length>65536)throw unavailable();
   const value:unknown=JSON.parse(raw);
   if(!object(value)||value.version!==1||!object(value.scope)||value.scope.userID!==scope.userID||value.scope.dealerID!==scope.dealerID||value.scope.recordID!==scope.recordID||!validEntries(value.entries,scope))throw unavailable();
   entries=value.entries.map(e=>({...e}));
  }
 }catch{throw unavailable();}
 let poisoned=false;let tail:Promise<unknown>=Promise.resolve();
 function usable(){if(poisoned)throw unavailable();}
 function update(change:(draft:PhotoUploadEntry[])=>void):Promise<void>{
  const work=tail.then(async()=>{
   usable();const next=entries.map(e=>({...e}));change(next);if(!validEntries(next,scope))throw invalid();
   try{await port.storage.write(address,JSON.stringify({version:1,scope,entries:next}));}
   catch{poisoned=true;throw unavailable();}
   entries=next;
  });
  tail=work.catch(()=>{});return work;
 }
 function transition(id:string,states:PhotoUploadPhase[],change:(entry:PhotoUploadEntry)=>void){
  return update(draft=>{const entry=draft.find(e=>e.id===id);if(!entry||!states.includes(entry.state))throw invalid();change(entry);});
 }
 return Object.freeze({
  snapshot(){usable();return entries.map(e=>({...e}));},
  reserve(id:string,size:number,key:string){return update(draft=>{const createdAt=port.now();if(!safe(createdAt))throw invalid();draft.push({id,size,key,createdAt,state:'reserved'});});},
  ready(id:string){return transition(id,['reserved'],e=>{e.state='ready';});},
  attempt(id:string,recordID:string,expectedRevision:number){return transition(id,['ready','attempted'],e=>{
   if(e.recordID!==undefined&&e.recordID!==recordID||e.state==='attempted'&&e.expectedRevision!==expectedRevision)throw invalid();
   e.recordID=recordID;e.expectedRevision=expectedRevision;e.state='attempted';
  });},
  acknowledge(id:string,photoID:string){return transition(id,['attempted','acknowledged'],e=>{
   if(e.state==='acknowledged'&&e.photoID!==photoID)throw invalid();
   e.photoID=photoID;e.state='acknowledged';
  });},
  conflict(id:string){return transition(id,['attempted'],e=>{e.state='conflict';});},
  reject(id:string){return transition(id,['attempted'],e=>{e.state='rejected';});},
  rebase(id:string,key:string){return transition(id,['conflict'],e=>{
   if(e.key===key)throw invalid();e.key=key;e.state='ready';delete e.expectedRevision;
  });},
  remove(id:string){return transition(id,['reserved','ready','conflict','rejected','acknowledged','removing'],e=>{e.state='removing';});},
  forget(id:string){return update(draft=>{const index=draft.findIndex(e=>e.id===id);if(index<0||draft[index]!.state!=='removing')throw invalid();draft.splice(index,1);});},
 });
}
