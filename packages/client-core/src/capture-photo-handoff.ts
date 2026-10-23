import {openPhotoUploadLedger,photoUploadExpired,type PhotoSelectionImport} from './photo-upload-ledger';
import {createSelectedMediaStore} from './selected-media';
import type {ProtectedInventoryDraftStorage} from './inventory-recovery';
/** Atomically gives a record ownership of immutable capture-scoped selected bytes. */
export async function handoffCapturePhoto(port:{
 userID:string;dealerID:string;recordID:string;selection:PhotoSelectionImport;
 active():boolean;authorize():Promise<void>;lease():Promise<()=>void>;
 storage():Promise<ProtectedInventoryDraftStorage>;sha256(bytes:Uint8Array):Promise<string>;now():number;
}){
 const active=()=>{if(!port.active())throw new Error('photo_handoff_inactive');};
 active();await port.authorize();active();const release=await port.lease();
 try{
  active();const storage=await port.storage();active();
  const scope={userID:port.userID,dealerID:port.dealerID,recordID:port.recordID};
  const ledger=await openPhotoUploadLedger({scope,storage,now:port.now});active();
  if(ledger.hasImport(port.selection))return;
  const media=createSelectedMediaStore({scope:{...scope,recordID:port.selection.sourceScope},storage,sha256:port.sha256});
  if(photoUploadExpired({...port.selection,state:'ready'},port.now())){await media.remove(port.selection.id);active();return;}
  const bytes=await media.read(port.selection.id);active();if(!bytes||bytes.length!==port.selection.size)throw new Error('photo_handoff_incomplete');
  await ledger.importReady(port.selection);active();
 }finally{release();}
}

/** Explicit local discard, including recovery after a partial handoff. Never edits server photos. */
export async function discardCapturePhoto(port:Parameters<typeof handoffCapturePhoto>[0]){
 const active=()=>{if(!port.active())throw new Error('photo_handoff_inactive');};
 active();await port.authorize();active();const release=await port.lease();
 try{
  active();const storage=await port.storage();active();
  const scope={userID:port.userID,dealerID:port.dealerID,recordID:port.recordID};
  const ledger=await openPhotoUploadLedger({scope,storage,now:port.now});active();
  const imported=ledger.hasImport(port.selection);const entry=ledger.snapshot().find(e=>e.id===port.selection.id);
  if(imported&&!entry)return;
  if(imported){await ledger.remove(port.selection.id);active();}
  await createSelectedMediaStore({scope:{...scope,recordID:port.selection.sourceScope},storage,sha256:port.sha256}).remove(port.selection.id);active();
  if(imported){await ledger.forget(port.selection.id);active();}
 }finally{release();}
}
