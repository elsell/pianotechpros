import {createInventoryRecoveryJournal,type ProtectedInventoryDraftStorage} from './inventory-recovery';
import {openInventoryFormWorkspace,type InventoryFormWorkspace,type InventoryFormRecord} from './inventory-form-workspace';
import {inventoryFormFromAttributes,inventoryFormErrors,isInventoryForm,type InventoryForm,type InventoryWireAttributes} from './inventory-form';
export type InventoryCaptureWorkspace = InventoryFormWorkspace & {ensureRecord():Promise<string|null>};
type RecordData={id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes};
type Intent={version:1;key:string;attempted:boolean;form:InventoryForm;record:InventoryFormRecord|null};
export async function openInventoryCapture(port:{
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
  const validate=(v:unknown):v is Intent=>!!v&&typeof v==='object'&&'version'in v&&v.version===1&&'key'in v&&validKey(v.key)&&'attempted'in v&&typeof v.attempted==='boolean'&&'form'in v&&isInventoryForm(v.form)&&'record'in v&&(v.record===null||validRecord(v.record));
  const journal=createInventoryRecoveryJournal({scope:{userID:port.userID,dealerID:port.dealerID,recordID:'@capture'},storage,now:port.now,validate});
  const loaded=await journal.load();if(!port.active()){unlock();return null;}
  let intent:Intent={version:1,key:loaded?.key??port.key(),attempted:loaded?.attempted??false,form:loaded?.form??inventoryFormFromAttributes({stock_number:''},port.decimal),record:loaded?.record??null};
  if(!validate(intent))throw Error('invalid_inventory_capture');
  let disposed=false;let dirty=!!loaded;let restored=!!loaded;let denied=false;let busy=false;let failure:unknown=null;
  let recovery:'ready'|'writing'|'failed'='ready';let writeVersion=0;let pendingWrite:Promise<void>=Promise.resolve();let pendingRemoval:Promise<void>=Promise.resolve();let cancel:(()=>void)|null=null;
  let editor:InventoryFormWorkspace|null=null;let unsubscribe=()=>{};let migrated=false;let migrationFailed=false;let saving:Promise<void>|null=null;
  const listeners=new Set<(s:ReturnType<InventoryFormWorkspace['snapshot']>)=>void>();
  function snapshot():ReturnType<InventoryFormWorkspace['snapshot']>{
   if(editor){const s=editor.snapshot();return {...s,busy:s.busy||busy,recovery:!migrated?(migrationFailed?'failed':'writing'):s.recovery};}
   return {baseline:null,draft:disposed||denied||!port.active()?null:{...intent.form},latest:null,dirty,busy,uncertain:intent.attempted&&!intent.record,conflict:false,denied,failure,recovery,restored,invalid:!disposed&&!denied&&port.active()&&inventoryFormErrors(intent.form).some(field=>field!=='stock_number')};
  }
  function notify(){if(!disposed)for(const listener of listeners)listener(snapshot());}
  function unschedule(){cancel?.();cancel=null;}
  function schedule(){unschedule();if(!disposed&&!editor&&dirty&&!busy&&!restored&&!failure&&!intent.attempted&&recovery==='ready')cancel=port.schedule(()=>{cancel=null;void save();});}
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
   try{await (pendingRemoval=journal.discard());if(disposed)return false;migrated=true;unlock();port.onCreated(editor.recordID());notify();return true;}
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
    if(!disposed){if(port.classify(error)==='denied'){denied=true;dirty=false;intent={...intent,form:inventoryFormFromAttributes({stock_number:''},port.decimal),record:null};++writeVersion;try{await (pendingRemoval=journal.discard());recovery='ready';}catch{recovery='failed';}unlock();}
     else failure=new Error('inventory_capture_failed');}
   }finally{busy=false;notify();}
  }
  function save(){if(saving)return saving;saving=runSave().finally(()=>{saving=null;});return saving;}
  const result:InventoryCaptureWorkspace=Object.freeze({
   snapshot,
   subscribe(listener){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
   change(form){if(disposed||denied||!port.active())return;if(editor){editor.change(form);return;}intent={...intent,form:{...form}};dirty=true;failure=null;persist();},
   save,
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
   async drain(){await saving;await editor?.drain();},
   async recover(){if(editor){await editor.recover();}else await save();},
   keepEdits(){editor?.keepEdits();},useLatest(){editor?.useLatest();},
   async flush(){if(editor)return migrated&&await editor.flush();return flushIntent();},
   async protect(){if(editor)return await editor.protect()&&migrated;if(dirty)persist();return flushIntent();},
   recordID:()=>editor?.recordID()??intent.record?.id??'',
   dispose(){if(disposed)return;disposed=true;unschedule();unsubscribe();const editorDrained=editor?Promise.allSettled([editor.flush(),editor.drain()]):undefined;editor?.dispose();listeners.clear();intent={...intent,form:inventoryFormFromAttributes({stock_number:''},port.decimal),record:null};void Promise.allSettled([pendingWrite,pendingRemoval,editorDrained]).then(unlock);},
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
