import {createInventoryWorkspace} from './inventory-workspace';
import {createInventoryRecoveryJournal, type ProtectedInventoryDraftStorage, type InventoryRecoveryScope} from './inventory-recovery';
import {isInventoryEditorCheckpoint, type InventoryEditorCheckpoint} from './inventory-editor';
import {inventoryFormFromAttributes,inventoryAttributesFromForm,inventoryFormErrors,isInventoryForm,type InventoryForm,type InventoryWireAttributes} from './inventory-form';
export interface InventoryFormRecord{id:string;dealer_id:string;revision:number;attributes:InventoryForm}
type WireRecord={id:string;dealer_id:string;revision:number;attributes:InventoryWireAttributes};
export async function openInventoryFormWorkspace(port:{
 fallbackRecovery?:InventoryEditorCheckpoint<InventoryForm,InventoryFormRecord>;
 scope:InventoryRecoveryScope;decimal:'.'|',';active():boolean;now():number;
 storage():Promise<ProtectedInventoryDraftStorage>;get():Promise<WireRecord>;
 edit(attributes:InventoryWireAttributes,revision:number):Promise<WireRecord>;
 classify(error:unknown):'denied'|'conflict'|'rejected'|'uncertain';schedule(run:()=>void):()=>void;
}){
 // Current authorization precedes any disclosure of a cached draft.
 const current=await port.get();if(!port.active())return null;
 if(current.id!==port.scope.recordID||current.dealer_id!==port.scope.dealerID)throw Error('inventory_scope_mismatch');
 const record=(v:unknown):v is InventoryFormRecord=>!!v&&typeof v==='object'&&'id'in v&&v.id===port.scope.recordID&&'dealer_id'in v&&v.dealer_id===port.scope.dealerID&&'revision'in v&&Number.isSafeInteger(v.revision)&&Number(v.revision)>0&&'attributes'in v&&isInventoryForm(v.attributes);
 const validate=(v:unknown):v is InventoryEditorCheckpoint<InventoryForm,InventoryFormRecord>=>isInventoryEditorCheckpoint(v,port.scope,isInventoryForm,record);
 if(port.fallbackRecovery&&!validate(port.fallbackRecovery))throw Error('invalid_inventory_checkpoint');
 const journal=createInventoryRecoveryJournal({scope:port.scope,storage:await port.storage(),now:port.now,validate});
 const loaded=await journal.load()??port.fallbackRecovery;if(!port.active())return null;
 const equal=(a:InventoryForm,b:InventoryForm)=>Object.keys(a).every(k=>a[k as keyof InventoryForm]===b[k as keyof InventoryForm]);
 // Clean checkpoints carry no unsent work; use the current authorized record.
 const saved=loaded&&(loaded.pending||loaded.conflict||!equal(loaded.baseline.attributes,loaded.draft))?loaded:null;
 const decimal=saved?.draft.decimal??port.decimal;
 const map=(r:WireRecord):InventoryFormRecord=>({id:r.id,dealer_id:r.dealer_id,revision:r.revision,attributes:inventoryFormFromAttributes(r.attributes,decimal)});
 const workspace=createInventoryWorkspace({active:port.active,initial:map(current),recovery:saved??undefined,journal,copy:a=>({...a}),equal,valid:a=>!inventoryFormErrors(a).length,
  classify:port.classify,schedule:port.schedule,get:async()=>map(await port.get()),edit:async(a,revision)=>map(await port.edit(inventoryAttributesFromForm(a),revision)),
 });
 return Object.freeze({...workspace,recordID:()=>current.id});
}
export type InventoryFormWorkspace=NonNullable<Awaited<ReturnType<typeof openInventoryFormWorkspace>>>;
