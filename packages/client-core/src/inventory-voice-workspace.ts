import type {InventoryVoiceField} from './inventory-voice';
import type {InventoryForm} from './inventory-form';
import type {InventoryFormRecord} from './inventory-form-workspace';
import {createInventoryVoiceWorkflow,type InventoryVoiceIssue,type InventoryVoiceState} from './inventory-voice-workflow';
export interface InventoryVoiceWorkspacePort {
 accountID:string;dealerID:string;active():boolean;
 snapshot():{baseline:InventoryFormRecord|null;draft:InventoryForm|null;denied:boolean};
 change(form:InventoryForm,fields?:readonly InventoryVoiceField[]):void;
 ensureRecord?():Promise<string|null>;
 withMutation(work:(baseline:InventoryFormRecord)=>Promise<void>):Promise<unknown>;
 transcribe(recordID:string,revision:number,audio:Uint8Array,mime:string,signal:AbortSignal):Promise<{revision:number;transcript:string}>;
 extract(recordID:string,revision:number,transcript:string,signal:AbortSignal):Promise<unknown>;
 classify(error:unknown):InventoryVoiceIssue;
}
export type InventoryVoiceWorkspaceState={busy:boolean;paused:boolean;voice:InventoryVoiceState|null;issue:InventoryVoiceIssue|null};
/** Owns the editor queue, independently of recording and platform presentation. */
export function createInventoryVoiceWorkspace(port:InventoryVoiceWorkspacePort){
 let disposed=false,busy=false,paused=false,generation=0,issue:InventoryVoiceIssue|null=null;
 let workflow:ReturnType<typeof createInventoryVoiceWorkflow>|null=null,off=()=>{},release:(()=>void)|null=null;
 const listeners=new Set<(state:InventoryVoiceWorkspaceState)=>void>();
 const allowed=()=>!disposed&&port.active()&&!port.snapshot().denied;
 const snapshot=():InventoryVoiceWorkspaceState=>({busy,paused,voice:allowed()?workflow?.snapshot()??null:null,issue});
 function emit(){if(!disposed)for(const listener of listeners){try{listener(snapshot());}catch{/* Presentation failure cannot retain the queue. */}}}
 function clear(){generation++;off();off=()=>{};workflow?.dispose();workflow=null;release?.();release=null;}
 function cancel(){clear();issue=null;emit();}
 function reconcile(){if(!allowed()){clear();issue=!disposed&&port.snapshot().denied?'denied':null;emit();}}
 async function run(text:string,audio:Uint8Array|null,mime:string){
  if(busy||!allowed()){audio?.fill(0);return;}
  clear();issue=null;busy=true;const ticket=generation;const live=()=>allowed()&&generation===ticket;emit();
  try{
   if(!live())return;
   if(port.ensureRecord){if(!await port.ensureRecord())throw Error('voice_record_unavailable');if(!live())return;}
   await port.withMutation(async baseline=>{
    if(!live())return;
    if(baseline.dealer_id!==port.dealerID)throw Error('voice_scope');
    paused=true;emit();if(!live())return;
    const current=()=>{const s=port.snapshot();return live()&&s.draft&&s.baseline&&s.baseline.id===baseline.id&&s.baseline.dealer_id===port.dealerID?{accountID:port.accountID,dealerID:port.dealerID,recordID:baseline.id,revision:s.baseline.revision,form:s.draft}:null;};
    const request=async<T>(work:()=>Promise<T>):Promise<T>=>{try{return await work();}catch(error){if(live()&&port.classify(error)==='denied'){clear();issue='denied';emit();}throw error;}};
    workflow=createInventoryVoiceWorkflow({scope:{accountID:port.accountID,dealerID:port.dealerID,recordID:baseline.id},current,
     change:(form,fields)=>{if(!current())return false;port.change(form,fields);const value=current()?.form;return !!value&&Object.keys(form).every(key=>value[key as keyof InventoryForm]===form[key as keyof InventoryForm]);},
     transcribe:(revision,bytes,type,signal)=>request(()=>port.transcribe(baseline.id,revision,bytes,type,signal)),
     extract:(revision,transcript,signal)=>request(()=>port.extract(baseline.id,revision,transcript,signal)),classify:port.classify,
    });
    const active=workflow;off=active.subscribe(()=>{if(live())emit();});
    if(!live())return;
    try{if(audio)await active.process(audio,mime);else await active.extractTranscript(text);}finally{audio?.fill(0);}
    if(live()&&active.snapshot().phase==='review')await new Promise<void>(resolve=>{release=resolve;});
   });
  }catch(error){if(live()){try{issue=port.classify(error);}catch{issue='unavailable';}if(issue==='denied')clear();}}
  finally{audio?.fill(0);busy=false;paused=false;emit();}
 }
 return Object.freeze({snapshot,
  subscribe(listener:(state:InventoryVoiceWorkspaceState)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  extractTranscript:(text:string)=>run(text.trim(),null,''),process:(audio:Uint8Array,mime:string)=>run('',audio,mime),
  apply(selection:readonly string[]){if(!allowed()){reconcile();return;}workflow?.apply(selection);if(workflow?.snapshot().phase==='applied'){release?.();release=null;}},
  refreshReview(){if(allowed())workflow?.refreshReview();else reconcile();},
  undo(){if(!busy&&allowed())workflow?.undo();else reconcile();},
  cancel,reconcile,dispose(){disposed=true;clear();listeners.clear();},
 });
}
