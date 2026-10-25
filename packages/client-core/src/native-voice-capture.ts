export type NativeVoiceIssue='permission'|'capture'|'size_limit'|'cleanup';
export type NativeVoiceState={phase:'idle'|'requesting'|'preparing'|'recording'|'stopping'|'failed';issue:NativeVoiceIssue|null;busy:boolean};
export interface NativeVoiceHandle{
 record(seconds:number):void;
 stop():Promise<void>;
 read(maxBytes:number):Promise<Uint8Array>;
 /** Idempotent; must retry any failed file cleanup without reviving released resources. */
 dispose():Promise<void>;
}
export interface NativeVoiceCapturePort{
 active():boolean;
 permission():Promise<boolean>;
 prepare(ended:(failed:boolean)=>void):Promise<NativeVoiceHandle>;
 changed(state:NativeVoiceState):void;
 completed(bytes:Uint8Array):void;
}
export function createNativeVoiceCapture(port:NativeVoiceCapturePort){
 let phase:NativeVoiceState['phase']='idle',issue:NativeVoiceIssue|null=null;
 let generation=0,disposed=false,acquiring=false,releasing=false,handle:NativeVoiceHandle|null=null;
 let pending:Promise<void>|null=null,closing:Promise<void>|null=null;
 const snapshot=():NativeVoiceState=>({phase:disposed?'idle':phase,issue:disposed?null:issue,busy:acquiring||releasing||!!handle||!!closing});
 const emit=()=>{if(!disposed)try{port.changed(snapshot());}catch{/* Observer failure cannot retain native resources. */}};
 const set=(next:NativeVoiceState['phase'],error:NativeVoiceIssue|null=null)=>{phase=next;issue=error;emit();};
 const live=(ticket:number)=>!disposed&&ticket===generation&&port.active();
 function close(deliver:boolean,reason:NativeVoiceIssue|null=null):Promise<void>{
  if(closing)return closing;
  const current=handle;if(!current)return Promise.resolve();releasing=true;handle=null;
  const ticket=generation;
  if(deliver)set('stopping');
  closing=(async()=>{
   let bytes:Uint8Array|null=null,error=reason,clean=false;
   try{
    await current.stop();
    if(deliver&&live(ticket)){
     bytes=await current.read(6*1024*1024);
     if(!(bytes instanceof Uint8Array)||!bytes.length)error='capture';
     else if(bytes.length>6*1024*1024)error='size_limit';
    }
   }catch{error='capture';}
   try{await current.dispose();clean=true;}catch{error='cleanup';handle=current;}
   if(!clean||error||!live(ticket)||!deliver){if(bytes instanceof Uint8Array)bytes.fill(0);set(error?'failed':'idle',error);return;}
   set('idle');
   if(bytes&&live(ticket)){try{port.completed(bytes);}catch{bytes.fill(0);}}else bytes?.fill(0);
  })().finally(()=>{closing=null;releasing=false;emit();});
  return closing;
 }
 async function drain(){for(;;){const tasks=[pending,closing].filter((p):p is Promise<void>=>!!p);if(!tasks.length)return;await Promise.all(tasks);}}
 async function start(){
  if(disposed||snapshot().busy||!port.active())return;
  const ticket=++generation;acquiring=true;set('requesting');
  pending=(async()=>{
   try{
    if(!live(ticket))return;
    if(!await port.permission()){if(live(ticket))set('failed','permission');return;}
    if(!live(ticket))return;set('preparing');if(!live(ticket))return;
    handle=await port.prepare(failed=>{
     if(!live(ticket))return;
     if(failed){generation++;void close(false,'capture');}else void close(true);
    });
    if(!live(ticket)){await close(false);return;}
    handle.record(60);if(live(ticket)&&handle)set('recording');
   }catch{if(handle)await close(false,'capture');else if(live(ticket))set('failed','capture');}
  })().finally(()=>{acquiring=false;pending=null;emit();});
  await pending;
 }
 function cancel(){generation++;set('idle');if(handle&&!closing)void close(false);return Promise.resolve().then(drain);}
 return {snapshot,start,stop:()=>phase==='recording'?close(true):closing??Promise.resolve(),cancel,drain,
  dispose(){disposed=true;return cancel();},
 };
}
