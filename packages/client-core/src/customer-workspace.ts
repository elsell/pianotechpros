import {createCustomerEditor,type CustomerEditorRecord} from './customer-editor';
import {customerAttributes,customerFormFromAttributes,type CustomerForm,type CustomerWireAttributes} from './customer-form';
import {createCustomerRecoveryJournal,type CustomerRecoveryScope,type ProtectedCustomerDraftStorage} from './customer-recovery';
type WireRecord={id:string;revision:number;attributes:CustomerWireAttributes};
export class CustomerWorkspaceError extends Error {
 constructor(readonly reason:'access'|'unavailable'|'storage'|'scope'){super('customer_workspace_'+reason);this.name='CustomerWorkspaceError';}
}
export async function openCustomerWorkspace(port:{
 scope:CustomerRecoveryScope;now():number;active():boolean;draft:CustomerForm;key():string;
 storage():Promise<ProtectedCustomerDraftStorage>;isMissing(error:unknown):boolean;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';
 api:{get():Promise<WireRecord>;timezones():Promise<string[]>;create(a:CustomerWireAttributes,key:string):Promise<WireRecord>;save(id:string,a:CustomerWireAttributes,revision:number):Promise<WireRecord>};
}){
 if(!port.active())return null;
 let current:WireRecord|null=null;
 try{current=await port.api.get();}catch(error){if(!port.active())return null;if(!port.isMissing(error))throw new CustomerWorkspaceError(port.classify(error)==='denied'?'access':'unavailable');}
 if(!port.active())return null;
 let names:string[];
 try{names=await port.api.timezones();}catch(error){if(!port.active())return null;throw new CustomerWorkspaceError(port.classify(error)==='denied'?'access':'unavailable');}
 if(!port.active())return null;
 if(!Array.isArray(names)||names.length>1000||!names.includes('UTC')||names.some((name,i)=>typeof name!=='string'||name.length>64||name==='Local'||name==='localtime'||!/^[-+A-Za-z0-9_]+(?:\/[-+A-Za-z0-9_]+)*$/.test(name)||i>0&&names[i-1]>=name))throw new CustomerWorkspaceError('unavailable');
 names=[...names];
 const zones=new Set(names);
 let storage:ProtectedCustomerDraftStorage;
 try{storage=await port.storage();}catch{if(!port.active())return null;throw new CustomerWorkspaceError('storage');}
 if(!port.active())return null;
 const journal=createCustomerRecoveryJournal({scope:port.scope,storage,zones,now:port.now,active:port.active});
 let loaded;
 try{loaded=await journal.load();}catch{journal.close();throw new CustomerWorkspaceError('storage');}
 if(!port.active()){journal.close();return null;}
 if(loaded.checkpoint?.baseline&&(!current||loaded.checkpoint.baseline.id!==current.id)){
  try{await journal.discard();}catch{throw new CustomerWorkspaceError('storage');}throw new CustomerWorkspaceError('scope');
 }
 const map=(r:WireRecord):CustomerEditorRecord=>({id:r.id,revision:r.revision,attributes:customerFormFromAttributes(r.attributes)});
 const cp=loaded.checkpoint;
 const recovery=cp&&(cp.pending||cp.conflict||!cp.baseline||JSON.stringify(cp.draft)!==JSON.stringify(cp.baseline.attributes))?cp:undefined;
 let disposed=false;let cleanup:Promise<void>=Promise.resolve();
 const active=()=>!disposed&&port.active();
 const requireActive=()=>{if(!active())throw new CustomerWorkspaceError('access');};
 const classify=(error:unknown)=>{
  const kind=port.classify(error);
  if(kind==='denied'){cleanup=journal.discard();void cleanup.catch(()=>{});}
  return kind;
 };
 let editor:ReturnType<typeof createCustomerEditor>;
 try{editor=createCustomerEditor({initial:current?map(current):null,draft:port.draft,recovery,zones,active,key:port.key,persist:journal.save,classify,
  create:async(a,key)=>{requireActive();const result=await port.api.create(customerAttributes(a,zones),key);requireActive();return map(result);},
  update:async(id,a,revision)=>{requireActive();const result=await port.api.save(id,customerAttributes(a,zones),revision);requireActive();return map(result);},
  get:async()=>{requireActive();const result=await port.api.get();requireActive();return map(result);},
 });}catch{journal.close();throw new CustomerWorkspaceError('unavailable');}
 return Object.freeze({
  editor,restored:!!recovery,recoveryNotice:loaded.discarded,timezones:()=>[...names],
  async protect():Promise<boolean>{await editor.flush();const state=editor.snapshot();return active()&&state!==null&&state.failure!=='storage';},
  async close(){await editor.flush();if(active()&&editor.snapshot()?.failure==='storage')return false;disposed=true;editor.dispose();journal.close();return true;},
  dispose(){disposed=true;editor.dispose();journal.close();},
  async cleanup(){await cleanup;},
 });
}
export type CustomerWorkspace=NonNullable<Awaited<ReturnType<typeof openCustomerWorkspace>>>;
