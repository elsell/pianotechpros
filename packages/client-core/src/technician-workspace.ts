import type {TechnicianWorkspaceOwnership,TechnicianWorkspaceLease} from './technician-ownership';
import {createTechnicianEditor,type TechnicianEditorRecord} from './technician-editor';
import {technicianAttributes,technicianFormFromAttributes,type TechnicianForm,type TechnicianWireAttributes} from './technician-form';
import {createTechnicianRecoveryJournal,technicianRecoveryIdentity,type TechnicianRecoveryScope,type ProtectedTechnicianDraftStorage} from './technician-recovery';
type WireRecord={id:string;revision:number;attributes:TechnicianWireAttributes};
export class TechnicianWorkspaceError extends Error {
 constructor(readonly reason:'access'|'unavailable'|'storage'|'scope'|'busy'){super('technician_workspace_'+reason);this.name='TechnicianWorkspaceError';}
}
export async function openTechnicianWorkspace(port:{
 scope:TechnicianRecoveryScope;ownership:TechnicianWorkspaceOwnership;now():number;active():boolean;draft:TechnicianForm;key():string;
 storage():Promise<ProtectedTechnicianDraftStorage>;isMissing(error:unknown):boolean;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
 api:{get():Promise<WireRecord>;timezones():Promise<string[]>;create(a:TechnicianWireAttributes,key:string):Promise<WireRecord>;save(id:string,a:TechnicianWireAttributes,revision:number):Promise<WireRecord>};
}){
 if(!port.active())return null;
 const identity=technicianRecoveryIdentity(port.scope);
 let acquired:TechnicianWorkspaceLease|null;
 try{acquired=await port.ownership.acquire(identity.key);}catch{throw new TechnicianWorkspaceError('unavailable');}
 if(!acquired)throw new TechnicianWorkspaceError('busy');
 const lease=acquired;
 let handedOff=false;
 try{
 if(!port.active())return null;
 let current:WireRecord|null=null;
 try{current=await port.api.get();}catch(error){if(!port.active())return null;if(!port.isMissing(error))throw new TechnicianWorkspaceError(port.classify(error)==='denied'?'access':'unavailable');}
 if(!port.active())return null;
 let names:string[];
 try{names=await port.api.timezones();}catch(error){if(!port.active())return null;throw new TechnicianWorkspaceError(port.classify(error)==='denied'?'access':'unavailable');}
 if(!port.active())return null;
 if(!Array.isArray(names)||names.length>1000||!names.includes('UTC')||names.some((name,i)=>typeof name!=='string'||name.length>64||name==='Local'||name==='localtime'||!/^[-+A-Za-z0-9_]+(?:\/[-+A-Za-z0-9_]+)*$/.test(name)||i>0&&names[i-1]>=name))throw new TechnicianWorkspaceError('unavailable');
 names=[...names];
 const zones=new Set(names);
 let storage:ProtectedTechnicianDraftStorage;
 try{storage=await port.storage();}catch{if(!port.active())return null;throw new TechnicianWorkspaceError('storage');}
 if(!port.active())return null;
 const journal=createTechnicianRecoveryJournal({scope:identity.scope,storage,zones,now:port.now,active:port.active});
 let loaded;
 try{loaded=await journal.load();}catch{journal.close();throw new TechnicianWorkspaceError('storage');}
 if(!port.active()){journal.close();return null;}
 if(loaded.checkpoint?.baseline&&(!current||loaded.checkpoint.baseline.id!==current.id)){
  try{await journal.discard();}catch{throw new TechnicianWorkspaceError('storage');}throw new TechnicianWorkspaceError('scope');
 }
 const map=(r:WireRecord):TechnicianEditorRecord=>({id:r.id,revision:r.revision,attributes:technicianFormFromAttributes(r.attributes)});
 const cp=loaded.checkpoint;
 const recovery=cp&&(cp.pending||cp.conflict||!cp.baseline||JSON.stringify(cp.draft)!==JSON.stringify(cp.baseline.attributes))?cp:undefined;
 let disposed=false,deleteNeeded=false;let closing:Promise<void>|null=null;
 const active=()=>!disposed&&port.active();
 const requireActive=()=>{if(!active())throw new TechnicianWorkspaceError('access');};
 const classify=(error:unknown)=>{
  const kind=port.classify(error);
  if(kind==='denied'){deleteNeeded=true;void finish().catch(()=>{});}
  return kind;
 };
 let editor:ReturnType<typeof createTechnicianEditor>;
 try{editor=createTechnicianEditor({initial:current?map(current):null,draft:port.draft,recovery,zones,active,key:port.key,persist:journal.save,classify,
  create:async(a,key)=>{requireActive();const result=await port.api.create(technicianAttributes(a,zones),key);requireActive();return map(result);},
  update:async(id,a,revision)=>{requireActive();const result=await port.api.save(id,technicianAttributes(a,zones),revision);requireActive();return map(result);},
  get:async()=>{requireActive();const result=await port.api.get();requireActive();return map(result);},
 });}catch{journal.close();throw new TechnicianWorkspaceError('unavailable');}
 function finish():Promise<void>{
  if(!disposed){disposed=true;editor.dispose();journal.close();}
  if(!closing){closing=Promise.resolve().then(async()=>{await editor.flush();if(deleteNeeded)await journal.discard();await journal.drain();await lease.release();});void closing.catch(()=>{closing=null;});}
  return closing;
 }
 handedOff=true;
 return Object.freeze({
  editor,restored:!!recovery,recoveryNotice:loaded.discarded,timezones:()=>[...names],
  async protect():Promise<boolean>{await editor.flush();const state=editor.snapshot();return active()&&state!==null&&state.failure!=='storage';},
  async close(){await editor.flush();if(active()&&editor.snapshot()?.failure==='storage')return false;await finish();return true;},
  dispose(){void finish().catch(()=>{});},
  async cleanup(){if(disposed||deleteNeeded)await finish();},
 });
 }finally{if(!handedOff)await lease.release();}
}
export type TechnicianWorkspace=NonNullable<Awaited<ReturnType<typeof openTechnicianWorkspace>>>;
