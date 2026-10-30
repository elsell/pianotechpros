import {isInventoryForm,type InventoryForm} from './inventory-form';
import {validInventoryVoiceProposal,applyInventoryVoiceProposal,type InventoryVoiceProposal,type InventoryVoiceField,type InventoryVoiceChange} from './inventory-voice';
export type InventoryVoiceScope={accountID:string;dealerID:string;recordID:string};
export type InventoryVoiceContext=InventoryVoiceScope&{revision:number;form:InventoryForm};
export type InventoryVoiceIssue='invalid_input'|'conflict'|'denied'|'rate_limited'|'unavailable'|'network'|'protocol_error';
export type InventoryVoiceState={phase:'idle'|'transcribing'|'extracting'|'review'|'applied'|'failed';busy:boolean;transcript:string;proposal:InventoryVoiceProposal|null;reviewed:InventoryForm|null;issue:InventoryVoiceIssue|null;conflicts:InventoryVoiceField[];canUndo:boolean};
export interface InventoryVoiceWorkflowPort{
 scope:InventoryVoiceScope;
 current():InventoryVoiceContext|null;
 change(form:InventoryForm,voiceFields?:readonly InventoryVoiceField[]):boolean;
 transcribe(revision:number,audio:Uint8Array,mime:string,signal:AbortSignal):Promise<{revision:number;transcript:string}>;
 extract(revision:number,transcript:string,signal:AbortSignal):Promise<unknown>;
 classify(error:unknown):InventoryVoiceIssue;
}
const initial=():InventoryVoiceState=>({phase:'idle',busy:false,transcript:'',proposal:null,reviewed:null,issue:null,conflicts:[],canUndo:false});
const transcriptOK=(v:unknown):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&[...v].length<=16000&&!/\p{Surrogate}/u.test(v);
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
class WorkflowFailure{constructor(readonly code:InventoryVoiceIssue){}}
export function createInventoryVoiceWorkflow(port:InventoryVoiceWorkflowPort){
 const scope={...port.scope};let state=initial(),disposed=false,generation=0,inFlight=false;let pending:AbortController|null=null;let undo:InventoryVoiceChange|null=null;
 const listeners=new Set<(s:InventoryVoiceState)=>void>();
 function clear(){generation++;pending?.abort();pending=null;undo=null;state=initial();}
 function current(){
  if(disposed)return null;
  let c:InventoryVoiceContext|null;try{c=port.current();}catch{c=null;}
  if(!c||!scope.accountID||!scope.dealerID||!scope.recordID||c.accountID!==scope.accountID||c.dealerID!==scope.dealerID||c.recordID!==scope.recordID||!Number.isSafeInteger(c.revision)||c.revision<1||!isInventoryForm(c.form)){clear();return null;}
  return {...c,form:{...c.form}};
 }
 function change(form:InventoryForm,fields?:readonly InventoryVoiceField[]){try{return port.change(form,fields)===true;}catch{return false;}}
 function snapshot(){if(!current())return initial();return {...copy(state),busy:inFlight};}
 function emit(){if(!disposed)for(const listener of listeners)listener(snapshot());}
 function live(ticket:number,revision?:number){const c=current();if(!c||ticket!==generation)return null;if(revision!==undefined&&c.revision!==revision)throw new WorkflowFailure('conflict');return c;}
 function issue(error:unknown):InventoryVoiceIssue{if(error instanceof WorkflowFailure)return error.code;let code:unknown;try{code=port.classify(error);}catch{}return ['invalid_input','conflict','denied','rate_limited','unavailable','network','protocol_error'].includes(String(code))?code as InventoryVoiceIssue:'unavailable';}
 async function run(audio:Uint8Array|null,mime:string,transcript:string){
  const c=current();if(!c||inFlight)return;
  inFlight=true;clear();const ticket=generation,controller=new AbortController();pending=controller;
  state={...initial(),phase:audio?'transcribing':'extracting',transcript};emit();
  try{
   if(!live(ticket,c.revision))return;
   if(audio){
    const result=await port.transcribe(c.revision,audio,mime,controller.signal);
    if(!live(ticket,c.revision))return;
    if(!result||result.revision!==c.revision||!transcriptOK(result.transcript))throw new WorkflowFailure('protocol_error');
    transcript=result.transcript;state={...state,phase:'extracting',transcript};emit();
   }
   if(!live(ticket,c.revision))return;
   const result=await port.extract(c.revision,transcript,controller.signal);
   const now=live(ticket,c.revision);if(!now)return;
   if(!validInventoryVoiceProposal(result)||result.revision!==c.revision||result.transcript!==transcript)throw new WorkflowFailure('protocol_error');
   state={...state,phase:'review',proposal:copy(result),reviewed:{...now.form},issue:null};emit();
  }catch(error){
   if(!live(ticket))return;
   const code=issue(error);if(code==='denied'){clear();emit();return;}
   state={...state,phase:'failed',proposal:null,reviewed:null,issue:code,canUndo:false};emit();
  }finally{audio?.fill(0);inFlight=false;if(ticket===generation)pending=null;emit();}
 }
 return Object.freeze({
  snapshot,
  subscribe(listener:(s:InventoryVoiceState)=>void){if(!disposed)listeners.add(listener);listener(snapshot());return ()=>{listeners.delete(listener);};},
  async process(source:Uint8Array,mime:string){
   if(!current()||inFlight)return;
   if(!(source instanceof Uint8Array)||!source.byteLength||source.byteLength>6*1024*1024||typeof mime!=='string'||!mime||mime.length>128){clear();state={...state,phase:'failed',issue:'invalid_input'};emit();return;}
   await run(new Uint8Array(source),mime,'');
  },
  async extractTranscript(transcript:string){
   if(!current()||inFlight)return;
   if(!transcriptOK(transcript)){clear();state={...state,phase:'failed',issue:'invalid_input'};emit();return;}
   await run(null,'',transcript);
  },
  async clarify(field:InventoryVoiceField,answer:string){
   const c=current();if(!c||inFlight||state.phase!=='review'||!state.proposal||!state.reviewed)return;
   const prior=copy(state.proposal);
   if(c.revision!==prior.revision){state={...state,issue:'conflict'};emit();return;}
   const transcript=`${prior.transcript}\nClarification for ${field}: ${answer}`;
   if(!prior.candidates.some(candidate=>candidate.field===field)||!transcriptOK(answer)||!transcriptOK(transcript)){state={...state,issue:'invalid_input'};emit();return;}
   inFlight=true;const ticket=generation,controller=new AbortController();pending=controller;state={...state,issue:null};emit();
   try{
    if(!live(ticket,c.revision))return;
    const result=await port.extract(c.revision,transcript,controller.signal);
    if(!live(ticket,c.revision))return;
    if(!validInventoryVoiceProposal(result)||result.revision!==c.revision||result.transcript!==transcript)throw new WorkflowFailure('protocol_error');
    const candidate=result.candidates.find(value=>value.field===field);if(!candidate)throw new WorkflowFailure('protocol_error');
    state={...state,transcript,proposal:{revision:prior.revision,transcript,candidates:prior.candidates.map(value=>value.field===field?copy(candidate):value)},issue:null};
   }catch(error){
    if(!live(ticket))return;const code=issue(error);if(code==='denied'){clear();return;}
    state={...state,issue:code};
   }finally{inFlight=false;if(ticket===generation)pending=null;emit();}
  },
  refreshReview(){const c=current();if(!c||inFlight||state.phase!=='review'||!state.proposal)return;if(c.revision!==state.proposal.revision){state={...state,issue:'conflict'};emit();return;}state={...state,reviewed:{...c.form},conflicts:[],issue:null};emit();},
  apply(selection:readonly string[]){
   const c=current();if(!c||inFlight||state.phase!=='review'||!state.proposal||!state.reviewed)return;
   if(c.revision!==state.proposal.revision){state={...state,issue:'conflict'};emit();return;}
   try{
    const result=applyInventoryVoiceProposal(state.proposal,state.reviewed,c.form,selection);
    if(!result.change){state={...state,conflicts:result.conflicts,issue:'conflict'};emit();return;}
    const ticket=generation,accepted=change(result.change.after(),result.change.fields());if(!live(ticket))return;if(!accepted){state={...state,issue:'unavailable'};emit();return;}
    undo=result.change;state={...state,phase:'applied',proposal:null,reviewed:null,conflicts:[],issue:null,canUndo:undo.fields().length>0};emit();
   }catch{if(current()){state={...state,issue:'invalid_input'};emit();}}
  },
  undo(){const c=current();if(!c||!undo||!state.canUndo)return;const result=undo.undo(c.form),ticket=generation,accepted=change(result.form);if(!live(ticket))return;if(!accepted){state={...state,issue:'unavailable'};emit();return;}undo=null;state={...state,phase:'applied',canUndo:false,conflicts:result.conflicts,issue:result.conflicts.length?'conflict':null};emit();},
  cancel(){clear();emit();},
  dispose(){clear();disposed=true;listeners.clear();},
 });
}
