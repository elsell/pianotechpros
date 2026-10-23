import type {NativePickerState} from './native-photo-picker';
interface Picker {
 restore():Promise<NativePickerState>;select(source:'camera'|'library'):Promise<NativePickerState>;
 consume(id:string):Promise<void>;discardPending():Promise<void>;
}
/** Presentation lifetime policy. The broker remains the authority for durable ownership. */
export function createNativePickerSession(port:{active():boolean;bind():Promise<{picker:Picker;release():void}>}){
 let binding:Awaited<ReturnType<typeof port.bind>>|null=null;let state:NativePickerState={status:'idle'};
 let error:null|'other_target'|'unavailable'=null;let disposed=false;let pending:Promise<void>|null=null;
 const listeners=new Set<(value:ReturnType<typeof snapshot>)=>void>();
 const active=()=>!disposed&&port.active();
 function snapshot(){return {state:active()?{...state}:{status:'idle' as const},held:active()&&!!binding&&state.status!=='idle'&&state.status!=='denied',busy:active()&&!!pending,error:active()?error:null};}
 function notify(){if(active())for(const listener of listeners){try{listener(snapshot());}catch{/* Presentation cannot change ownership. */}}}
 function release(){const owned=binding;binding=null;owned?.release();}
 function accept(next:NativePickerState){if(!active())return;state={...next};if(next.status==='idle'||next.status==='denied')release();}
 async function run(work:(picker:Picker)=>Promise<NativePickerState>,recheck=false):Promise<void>{
  if(!active()||pending)return;
  // Defer work so synchronous subscribers observe busy before any binding await.
  const job=Promise.resolve().then(async()=>{
   try{
    if(!active())return;if(!binding)binding=await port.bind();if(!active())return;
    accept(await work(binding.picker));error=null;
   }catch(failure){
    if(!active())return;
    error=failure instanceof Error&&failure.message==='native_picker_other_target'?'other_target':'unavailable';
    let recovered=false;
    if(recheck&&binding){try{accept(await binding.picker.restore());recovered=true;}catch{/* No evidence of a pending intent. */}}
    if(!recovered){state={status:'idle'};release();}
   }finally{if(!active())release();}
  });
  pending=job;notify();try{await job;}finally{pending=null;notify();}
 }
 return {
  snapshot,subscribe(listener:(value:ReturnType<typeof snapshot>)=>void){listeners.add(listener);listener(snapshot());return()=>{listeners.delete(listener);};},
  restore:()=>run(picker=>picker.restore()),
  select:(source:'camera'|'library')=>run(picker=>picker.select(source),true),
  consume:()=>run(async picker=>{if(state.status!=='selected'||!state.id)throw new Error('native_picker_unavailable');await picker.consume(state.id);return {status:'idle'};},true),
  discard:()=>run(async picker=>{await picker.discardPending();return {status:'idle'};}),
  async dispose(){disposed=true;listeners.clear();await pending;release();state={status:'idle'};},
 };
}
