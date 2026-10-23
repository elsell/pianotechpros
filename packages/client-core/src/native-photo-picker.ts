import type {ProtectedInventoryDraftStorage} from './inventory-recovery';
export interface NativePickerAsset {uri:string;width:number;height:number}
export type NativePickerResult={kind:'selected';asset:NativePickerAsset}|{kind:'cancelled'|'denied'};
export interface NativePickerScope {userID:string;dealerID:string;targetID:string}
export interface NativePickerPort {
 owner:{read():Promise<string|null>;write(value:string|null):Promise<void>};
 scope:NativePickerScope;active():boolean;now():number;key():string;
 authorize():Promise<void>;lease():Promise<()=>void>;storage():Promise<ProtectedInventoryDraftStorage>;
 pending():Promise<NativePickerResult|null>;launch(source:'camera'|'library'):Promise<NativePickerResult>;
 discard(asset:NativePickerAsset):Promise<void>;accept(asset:NativePickerAsset):Promise<void>;
}
type Intent={version:1;scope:NativePickerScope;id:string;source:'camera'|'library';createdAt:number;phase:'waiting'|'selected'|'processing';asset:NativePickerAsset|null};
export interface NativePickerState {status:'idle'|'denied'|'waiting'|'selected'|'uncertain'|'expired';id?:string}
const ttl=7*24*60*60*1000;
class PickerError extends Error {}
const failed=()=>new PickerError('native_picker_unavailable');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identity=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v);
const validScope=(v:unknown):v is NativePickerScope=>object(v)&&Object.keys(v).length===3&&identity(v.userID)&&identity(v.dealerID)&&identity(v.targetID,160);
function validAsset(v:unknown):v is NativePickerAsset {
 return object(v)&&Object.keys(v).length===3&&typeof v.uri==='string'&&v.uri.startsWith('file:///')&&v.uri.length<=2048&&!/[\x00-\x1f\x7f]/.test(v.uri)&&
  typeof v.width==='number'&&typeof v.height==='number'&&Number.isSafeInteger(v.width)&&Number.isSafeInteger(v.height)&&v.width>0&&v.height>0&&v.width<=12000&&v.height<=12000&&v.width*v.height<=60_000_000;
}
/** Owns the system-picker handoff, not upload retry. All storage must be protected. */
export function createNativePhotoPicker(port:NativePickerPort) {
 const scope={...port.scope};if(!validScope(scope))throw failed();
 const storageKey=JSON.stringify(['native-photo-picker',1,scope.userID]);
 const active=()=>{if(!port.active())throw new PickerError('native_picker_inactive');};
 function now(){const value=port.now();if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-ttl)throw failed();return value;}
 function parse(text:string):Intent {
  if(text.length>8192)throw failed();const v:unknown=JSON.parse(text);
  if(!object(v)||Object.keys(v).length!==7||v.version!==1||!validScope(v.scope)||!identity(v.id)||v.id.length<16||!['camera','library'].includes(String(v.source))||!Number.isSafeInteger(v.createdAt)||typeof v.createdAt!=='number'||v.createdAt<0||v.createdAt>now()||!['waiting','selected','processing'].includes(String(v.phase))||(v.phase==='waiting'?v.asset!==null:!validAsset(v.asset)))throw failed();
  if(v.scope.userID!==scope.userID)throw failed();
  if(v.scope.dealerID!==scope.dealerID||v.scope.targetID!==scope.targetID)throw new PickerError('native_picker_other_target');
  return v as unknown as Intent;
 }
 function state(intent:Intent|null):NativePickerState {
  active();return !intent?{status:'idle'}:{status:now()>=intent.createdAt+ttl?'expired':intent.phase==='processing'?'uncertain':intent.phase,id:intent.id};
 }
 async function run<T>(work:(storage:ProtectedInventoryDraftStorage)=>Promise<T>):Promise<T>{
  let release:(()=>void)|undefined;
  try {
   active();await port.authorize();active();release=await port.lease();active();
   const storage=await port.storage();active();const result=await work(storage);active();return result;
  }catch(error){if(error instanceof PickerError)throw error;throw failed();}
  finally{try{release?.();}catch{throw failed();}}
 }
 async function owns(id:string){active();const value=await port.owner.read();active();return value===id;}
 async function clearOwner(id:string){if(await owns(id)){await port.owner.write(null);active();}}
 async function load(storage:ProtectedInventoryDraftStorage){active();const text=await storage.read(storageKey);active();return text===null?null:parse(text);}
 async function save(storage:ProtectedInventoryDraftStorage,intent:Intent){active();await storage.write(storageKey,JSON.stringify(intent));active();}
 async function clear(storage:ProtectedInventoryDraftStorage){active();await storage.remove(storageKey);active();}
 async function clean(result:NativePickerResult|null){
  if(result?.kind==='selected'){
   const value=result.asset;
   // Cleanup does not decode dimensions; the native adapter checks URI ownership.
   if(!object(value)||typeof value.uri!=='string'||!value.uri.startsWith('file:///')||value.uri.length>2048||/[\x00-\x1f\x7f]/.test(value.uri))throw failed();
   await port.discard({uri:value.uri,width:typeof value.width==='number'?value.width:0,height:typeof value.height==='number'?value.height:0});
  }
 }
 async function receive(storage:ProtectedInventoryDraftStorage,intent:Intent,result:NativePickerResult):Promise<NativePickerState>{
  if(!port.active()){await clean(result);active();}
  if(!await owns(intent.id)){await clean(result);throw failed();}
  if(result.kind==='cancelled'||result.kind==='denied'){await clearOwner(intent.id);await clear(storage);return result.kind==='denied'?{status:'denied'}:state(null);}
  if(result.kind!=='selected'||!validAsset(result.asset)){await clean(result);throw failed();}
  const next:Intent={...intent,phase:'selected',asset:{...result.asset}};
  try{await save(storage,next);await clearOwner(intent.id);}catch(error){await clean(result);throw error;}
  return state(next);
 }
 return {
  select(source:'camera'|'library'):Promise<NativePickerState>{return run(async storage=>{
   if(source!=='camera'&&source!=='library')throw failed();
   if(await load(storage))throw new PickerError('native_picker_pending');
   const orphan=await port.pending();await clean(orphan);active();
   const intent:Intent={version:1,scope:{...scope},id:port.key(),source,createdAt:now(),phase:'waiting',asset:null};
   parse(JSON.stringify(intent));await save(storage,intent);await port.owner.write(intent.id);active();
   return receive(storage,intent,await port.launch(source));
  });},
  restore():Promise<NativePickerState>{return run(async storage=>{
   const intent=await load(storage);if(!intent||state(intent).status==='expired'||intent.phase!=='waiting')return state(intent);
   if(!await owns(intent.id))return {status:'uncertain',id:intent.id};
   const result=await port.pending();if(result)return receive(storage,intent,result);active();return state(intent);
  });},
  consume(id:string):Promise<void>{return run(async storage=>{
   const intent=await load(storage);if(!intent||intent.id!==id||state(intent).status!=='selected'||!intent.asset)throw failed();
   await save(storage,{...intent,phase:'processing'});active();if(now()>=intent.createdAt+ttl)throw failed();
   await port.accept({...intent.asset});active();await clear(storage);
  });},
  discard():Promise<void>{return run(async storage=>{
   const intent=await load(storage);if(!intent)return;
   if(intent.asset){await port.discard({...intent.asset});active();}
   else if(await owns(intent.id)){const result=await port.pending();await clean(result);active();}
   await clearOwner(intent.id);await clear(storage);
  });},
 };
}
