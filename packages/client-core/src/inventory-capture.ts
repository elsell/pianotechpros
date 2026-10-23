import {createSelectedMediaStore} from './selected-media';
import {photoUploadExpired,type PhotoSelectionImport} from './photo-upload-ledger';
import {createInventoryRecoveryJournal,type ProtectedInventoryDraftStorage} from './inventory-recovery';
import {openInventoryFormWorkspace,type InventoryFormWorkspace,type InventoryFormRecord} from './inventory-form-workspace';
import {inventoryFormFromAttributes,inventoryFormErrors,isInventoryForm,type InventoryForm,type InventoryWireAttributes} from './inventory-form';
export type InventoryCaptureWorkspace = InventoryFormWorkspace & {ensureRecord():Promise<string|null>;stagePhoto(bytes:Uint8Array):Promise<string|null>;pendingPhoto():PhotoSelectionImport|null;expiredPhoto():boolean;discardPhoto():Promise<void>};
type RecordData={id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes};
type Intent={version:1;key:string;attempted:boolean;form:InventoryForm;record:InventoryFormRecord|null;media?:PhotoSelectionImport|null};
export async function openInventoryCapture(port:{
 media?:{sha256(bytes:Uint8Array):Promise<string>;handoff(recordID:string,selection:PhotoSelectionImport):Promise<void>;discard?(recordID:string,selection:PhotoSelectionImport):Promise<void>};
 userID:string;dealerID:string;decimal:'.'|',';active():boolean;now():number;key():string;
 authorize():Promise<void>;lease():Promise<()=>void>;storage():Promise<ProtectedInventoryDraftStorage>;
 create(key:string):Promise<RecordData>;get(id:string):Promise<RecordData>;edit(id:string,attributes:InventoryWireAttributes,revision:number):Promise<RecordData>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';schedule(run:()=>void):()=>void;onCreated(id:string):void;
}):Promise<InventoryCaptureWorkspace|null>{
 await port.authorize();if(!port.active())return null;
 const release=await port.lease();let released=false;
 function unlock(){if(!released){released=true;release();}}
 try{
  const storage=await port.storage();
  const validKey=(v:unknown):v is string=>typeof v==='string'&&/^[\x21-\x7e]{16,128}$/.test(v);
  const validRecord=(v:unknown):v is InventoryFormRecord=>!!v&&typeof v==='object'&&'id'in v&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=128&&'dealer_id'in v&&v.dealer_id===port.dealerID&&'revision'in v&&Number.isSafeInteger(v.revision)&&Number(v.revision)>0&&'attributes'in v&&isInventoryForm(v.attributes)&&!!v.attributes.stock_number;
  const validMedia=(v:unknown):v is PhotoSelectionImport=>!!v&&typeof v==='object'&&'id'in v&&validKey(v.id)&&'key'in v&&validKey(v.key)&&'sourceScope'in v&&validKey(v.sourceScope)&&'size'in v&&Number.isSafeInteger(v.size)&&Number(v.size)>0&&Number(v.size)<=20*1024*1024&&'createdAt'in v&&Number.isSafeInteger(v.createdAt)&&Number(v.createdAt)>=0;
  const validate=(v:unknown):v is Intent=>!!v&&typeof v==='object'&&'version'in v&&v.version===1&&'key'in v&&validKey(v.key)&&'attempted'in v&&typeof v.attempted==='boolean'&&'form'in v&&isInventoryForm(v.form)&&'record'in v&&(v.record===null||validRecord(v.record))&&(!('media'in v)||v.media===null||validMedia(v.media)&&v.media.sourceScope===v.key);
  let photoExpired=false;
  async function expireMedia(value:Intent){
   const media=value.media;if(!media)return;if(!port.media||!port.active())throw Error('inventory_media_unavailable');
   if(value.record)await port.media.handoff(value.record.id,{...media});
   else await createSelectedMediaStore({scope:{userID:port.userID,dealerID:port.dealerID,recordID:media.sourceScope},storage,sha256:port.media.sha256}).remove(media.id);
   if(!port.active())throw Error('inventory_media_unavailable');photoExpired=true;
  }
  const journal=createInventoryRecoveryJournal({scope:{userID:port.userID,dealerID:port.dealerID,recordID:'@capture'},storage,now:port.now,validate,expire:expireMedia});
  let loaded=await journal.load();
  if(loaded?.media&&photoUploadExpired({...loaded.media,state:'ready'},port.now())){await expireMedia(loaded);loaded={...loaded,media:null};await journal.save(loaded);}
if(!port.active()){unlock();return null;}
  let intent:Intent={version:1,key:loaded?.key??port.key(),attempted:loaded?.attempted??false,form:loaded?.form??inventoryFormFromAttributes({stock_number:''},port.decimal),record:loaded?.record??null,media:loaded?.media??null};
  if(!validate(intent))throw Error('invalid_inventory_capture');
  let disposed=false;let dirty=!!loaded;let restored=!!loaded;let denied=false;let busy=false;let failure:unknown=null;
  let recovery:'ready'|'writing'|'failed'='ready';let writeVersion=0;let pendingWrite:Promise<void>=Promise.resolve();let pendingRemoval:Promise<void>=Promise.resolve();let cancel:(()=>void)|null=null;
  let editor:InventoryFormWorkspace|null=null;let unsubscribe=()=>{};let migrated=false;let migrationFailed=false;let saving:Promise<void>|null=null;let staging:Promise<string|null>|null=null;
  const listeners=new Set<(s:ReturnType<InventoryFormWorkspace['snapshot']>)=>void>();
  function snapshot():ReturnType<InventoryFormWorkspace['snapshot']>{
   if(editor){const s=editor.snapshot();return {...s,busy:s.busy||busy||!!staging,recovery:!migrated?(migrationFailed?'failed':'writing'):s.recovery};}
   return {baseline:null,draft:disposed||denied||!port.active()?null:{...intent.form},latest:null,dirty,busy:busy||!!staging,uncertain:intent.attempted&&!intent.record,conflict:false,denied,failure,recovery,restored,invalid:!disposed&&!denied&&port.active()&&inventoryFormErrors(intent.form).some(field=>field!=='stock_number')};
  }
  function notify(){if(!disposed)for(const listener of listeners)listener(snapshot());}
  function unschedule(){cancel?.();cancel=null;}
  function schedule(){unschedule();if(!disposed&&!editor&&dirty&&!busy&&!staging&&!restored&&!failure&&!intent.attempted&&recovery==='ready')cancel=port.schedule(()=>{cancel=null;void save();});}
  function persist(){
   const version=++writeVersion;recovery='writing';
   pendingWrite=journal.save(intent).then(()=>{if(!disposed&&version===writeVersion){recovery='ready';notify();schedule();}},()=>{if(!disposed&&version===writeVersion){recovery='failed';notify();schedule();}});notify();
  }
  async function flushIntent(){for(;;){const pending=pendingWrite;await pending;if(pending===pendingWrite)break;}return !disposed&&recovery==='ready';}
  async function finishMigration(){
   if(!editor||disposed)return false;
   migrationFailed=false;notify();
   if(!await editor.flush()&&!await editor.protect()){migrationFailed=true;notify();return false;}
   if(disposed)return false;
   try{
    if(intent.media){if(!port.media)throw Error('inventory_media_unavailable');const expired=photoUploadExpired({...intent.media,state:'ready'},port.now());await port.media.handoff(editor.recordID(),{...intent.media});photoExpired||=expired;if(disposed||!port.active())return false;intent={...intent,media:null};persist();if(!await flushIntent())throw Error('inventory_media_unavailable');}
    await (pendingRemoval=journal.discard());if(disposed)return false;migrated=true;unlock();port.onCreated(editor.recordID());notify();return true;}
   catch{migrationFailed=true;failure=new Error('inventory_capture_handoff_failed');notify();return false;}
  }
  async function attachRecord(currentCapture:boolean){
   const baseline=intent.record!;const id=baseline.id;
   const initial={...intent.form,stock_number:intent.form.stock_number||baseline.attributes.stock_number};
   const opened=await openInventoryFormWorkspace({scope:{userID:port.userID,dealerID:port.dealerID,recordID:id},decimal:initial.decimal,active:()=>!disposed&&port.active(),now:port.now,storage:async()=>storage,get:()=>port.get(id),edit:(a,r)=>port.edit(id,a,r),classify:port.classify,schedule:run=>migrated?port.schedule(run):()=>{},fallbackRecovery:{version:1,baseline,draft:initial,pending:null,conflict:false}});
   if(!opened)return;
   if(disposed){opened.dispose();return;}
   // Changes entered while the remote record/recovery journal was opening win locally.
   if(currentCapture)opened.change({...intent.form,stock_number:intent.form.stock_number||baseline.attributes.stock_number});
   editor=opened;unsubscribe=editor.subscribe(()=>notify());
   await finishMigration();
  }
  async function runSave(){
   if(disposed||denied||!port.active()||!dirty&&!editor)return;
   unschedule();busy=true;failure=null;restored=false;notify();
   try{
    if(!editor){
     if(!intent.record){intent={...intent,attempted:true};persist();if(!await flushIntent()||disposed||!port.active())return;
      const result=await port.create(intent.key);if(disposed||!port.active())return;
      if(result.dealer_id!==port.dealerID||!result.id||!Number.isSafeInteger(result.revision)||result.revision<1)throw Error('inventory_capture_protocol');
      intent={...intent,record:{id:result.id,dealer_id:result.dealer_id,revision:result.revision,attributes:inventoryFormFromAttributes(result.attributes,intent.form.decimal)}};
     }
     persist();if(!await flushIntent()||disposed||!port.active())return;await attachRecord(true);
    }else if(!migrated)await finishMigration();
    if(editor&&migrated&&!disposed&&port.active())await editor.save();
   }catch(error){
    if(!disposed){if(port.classify(error)==='denied'){
     denied=true;dirty=false;++writeVersion;
     try{
      if(intent.media){
       // A denied record read cannot establish whether its ledger already owns this source.
       if(intent.record||!port.media)throw Error('inventory_media_cleanup_pending');
       await createSelectedMediaStore({scope:{userID:port.userID,dealerID:port.dealerID,recordID:intent.media.sourceScope},storage,sha256:port.media.sha256}).remove(intent.media.id);
      }
      await (pendingRemoval=journal.discard());recovery='ready';
     }catch{recovery='failed';}
     intent={...intent,form:inventoryFormFromAttributes({stock_number:''},port.decimal),record:null,media:null};unlock();
    }
     else failure=new Error('inventory_capture_failed');}
   }finally{busy=false;notify();}
  }
  function save():Promise<void>{if(staging)return staging.then(()=>save());if(saving)return saving;saving=runSave().finally(()=>{saving=null;});return saving;}
  function stagePhoto(source:Uint8Array):Promise<string|null>{
   if(staging||disposed||denied||!port.active()||!port.media||!(source instanceof Uint8Array)||!source.length||source.length>20*1024*1024)return Promise.reject(Error('inventory_media_unavailable'));
   const bytes=new Uint8Array(source);const previous=saving;unschedule();
   staging=(async()=>{
    await previous;if(disposed||denied||!port.active())throw Error('inventory_media_unavailable');if(editor&&migrated)return null;
    if(!intent.media){intent={...intent,media:{id:port.key(),key:port.key(),size:bytes.length,createdAt:port.now(),sourceScope:intent.key}};dirty=true;}
    const selected=intent.media;if(!selected||selected.size!==bytes.length)throw Error('inventory_media_unavailable');
    persist();if(!await flushIntent()||disposed||!port.active())throw Error('inventory_media_unavailable');
    const media=createSelectedMediaStore({scope:{userID:port.userID,dealerID:port.dealerID,recordID:selected.sourceScope},storage,sha256:port.media!.sha256});
    await media.put(selected.id,bytes);if(disposed||!port.active())throw Error('inventory_media_unavailable');return selected.id;
   })().catch(error=>{if(!disposed)failure=new Error('inventory_media_unavailable');throw error;}).finally(()=>{staging=null;notify();schedule();});notify();return staging;
  }
  const result:InventoryCaptureWorkspace=Object.freeze({
   snapshot,
   subscribe(listener){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
   change(form){if(disposed||denied||!port.active())return;if(editor){editor.change(form);return;}intent={...intent,form:{...form}};dirty=true;failure=null;persist();},
   save,stagePhoto,
   expiredPhoto:()=>!disposed&&!denied&&port.active()&&photoExpired,
   pendingPhoto:()=>disposed||denied||!port.active()?null:intent.media?{...intent.media}:null,
   async discardPhoto(){
    if(staging)await staging;if(saving)await saving;
    if(disposed||denied||!port.active()||!intent.media||!port.media)throw Error('inventory_media_unavailable');
    const selected=intent.media;const media=createSelectedMediaStore({scope:{userID:port.userID,dealerID:port.dealerID,recordID:selected.sourceScope},storage,sha256:port.media.sha256});
    if(intent.record){if(!port.media.discard)throw Error('inventory_media_unavailable');await port.media.discard(intent.record.id,{...selected});}else await media.remove(selected.id);
    if(disposed||!port.active())throw Error('inventory_media_unavailable');intent={...intent,media:null};
    const empty=inventoryFormFromAttributes({stock_number:''},port.decimal);dirty=intent.attempted||Object.keys(empty).some(key=>empty[key as keyof InventoryForm]!==intent.form[key as keyof InventoryForm]);
    failure=null;persist();if(!await flushIntent())throw Error('inventory_media_unavailable');if(editor&&!migrated&&!await finishMigration())throw Error('inventory_media_unavailable');
   },
   async ensureRecord(){
    if(disposed||denied||!port.active())return null;
    if(!editor&&!dirty){dirty=true;persist();}
    await save();
    if(disposed||denied||!port.active()||!editor||!migrated||editor.snapshot().denied)return null;
    return editor.recordID();
   },
   async refresh(){if(editor)await editor.refresh();},
   async withMediaMutation<T>(work:(baseline:InventoryFormRecord)=>Promise<T>):Promise<T>{
    if(disposed||denied||!port.active()||!editor||!migrated)throw new Error('inventory_media_unavailable');
    return editor.withMediaMutation(work);
   },
   async drain(){await staging;await saving;await editor?.drain();},
   async recover(){if(editor){await editor.recover();}else await save();},
   keepEdits(){editor?.keepEdits();},useLatest(){editor?.useLatest();},
   async flush(){if(editor)return migrated&&await editor.flush();return flushIntent();},
   async protect(){if(editor)return await editor.protect()&&migrated;if(dirty)persist();return flushIntent();},
   recordID:()=>editor?.recordID()??intent.record?.id??'',
   dispose(){if(disposed)return;disposed=true;unschedule();unsubscribe();const editorDrained=editor?Promise.allSettled([editor.flush(),editor.drain()]):undefined;editor?.dispose();listeners.clear();intent={...intent,form:inventoryFormFromAttributes({stock_number:''},port.decimal),record:null};void Promise.allSettled(staging?[pendingWrite,pendingRemoval,editorDrained,staging]:[pendingWrite,pendingRemoval,editorDrained]).then(unlock);},
  });
  // A persisted handoff pointer is read-only recovery, never a repeated create.
  if(intent.record){try{await attachRecord(false);}catch(error){result.dispose();throw error;}}
  if(!port.active()){result.dispose();return null;}
  return result;
 }catch(error){unlock();throw error;}
}

/** Native process ownership; browser adapters must additionally coordinate tabs. */
export function createInventoryCaptureLease(){
 const held=new Set<string>();
 return async(userID:string,dealerID:string)=>{
  const key=JSON.stringify([userID,dealerID]);if(held.has(key))throw Error('inventory_capture_busy');held.add(key);
  let released=false;return()=>{if(!released){released=true;held.delete(key);}};
 };
}
