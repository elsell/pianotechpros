import {createBrowserVoiceMeter} from './voice-input-meter';
/** Local microphone capability. No network, storage or application credentials. */
export type VoiceCaptureIssue = 'unsupported' | 'permission' | 'device' | 'capture' | 'size_limit';
export type VoiceCaptureState = {phase:'idle'|'requesting'|'recording'|'stopping'|'failed';issue:VoiceCaptureIssue|null;level:number|null};
export type BrowserVoiceAudio = {bytes:Uint8Array;mimeType:string};
export interface VoiceCaptureClock {after(milliseconds:number,callback:()=>void):()=>void}
type Options = {
 changed(state:VoiceCaptureState):void;
 completed(audio:BrowserVoiceAudio):void;
 acquire?:()=>Promise<MediaStream>;
 clock?:VoiceCaptureClock;
};
const MAX_BYTES=6*1024*1024;
const FORMATS=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4'];

export function createBrowserVoiceRecorder(options:Options){
 let state:VoiceCaptureState={phase:'idle',issue:null,level:null};
 let generation=0,disposed=false,requesting=false;
 let stream:MediaStream|null=null,recorder:MediaRecorder|null=null;
 let stopMeter:(()=>void)|null=null;
 let chunks:Blob[]=[],size=0,cancelTimer:(()=>void)|null=null;
 const clock=options.clock??{after:(ms:number,callback:()=>void)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer);}};
 const emit=(phase:VoiceCaptureState['phase'],issue:VoiceCaptureIssue|null=null)=>{
  state={phase,issue,level:null};try{options.changed({...state});}catch{/* Observers cannot retain microphone access. */}
 };
 const release=()=>{
  stopMeter?.();stopMeter=null;
  cancelTimer?.();cancelTimer=null;
  const old=recorder;recorder=null;
  if(old){old.ondataavailable=null;old.onstop=null;old.onerror=null;try{if(old.state!=='inactive')old.stop();}catch{/* Tracks still stop below. */}}
  const tracks=stream?.getTracks()??[];stream=null;
  for(const track of tracks){track.onended=null;track.stop();}
  chunks=[];size=0;
 };
 const cancel=()=>{generation++;release();emit('idle');};
 const fail=(issue:VoiceCaptureIssue)=>{generation++;release();emit('failed',issue);};
 const stop=()=>{
  if(state.phase!=='recording'||!recorder)return;
  const current=recorder;stopMeter?.();stopMeter=null;emit('stopping');
  if(recorder!==current)return;
  cancelTimer?.();cancelTimer=null;
  try{current.stop();}catch{fail('capture');}
 };
 const hidden=()=>{if(document.visibilityState==='hidden')cancel();};
 const leaving=()=>cancel();
 document.addEventListener('visibilitychange',hidden);
 window.addEventListener('pagehide',leaving);
 async function start(){
  if(disposed||requesting||!['idle','failed'].includes(state.phase))return;
  if(!globalThis.MediaRecorder||!navigator.mediaDevices?.getUserMedia){fail('unsupported');return;}
  const selectedType=FORMATS.find(format=>MediaRecorder.isTypeSupported(format));
  if(!selectedType){fail('unsupported');return;}
  const mimeType:string=selectedType;
  const own=++generation;requesting=true;emit('requesting');
  try{
   if(disposed||own!==generation)return;
   const acquired=await(options.acquire??(()=>navigator.mediaDevices.getUserMedia({audio:true,video:false})))();
   if(disposed||own!==generation){for(const track of acquired.getTracks())track.stop();return;}
   stream=acquired;
   if(!acquired.getAudioTracks().some(track=>track.readyState==='live')){fail('device');return;}
   const active=new MediaRecorder(acquired,{mimeType,audioBitsPerSecond:64000});recorder=active;
   for(const track of acquired.getTracks())track.onended=()=>{if(own===generation)fail('device');};
   active.onerror=()=>{if(own===generation)fail('capture');};
   active.ondataavailable=event=>{
    if(own!==generation||disposed)return;
    if(size+event.data.size>MAX_BYTES){fail('size_limit');return;}
    if(event.data.size){chunks.push(event.data);size+=event.data.size;}
   };
   active.onstop=()=>{void finish();};
   async function finish(){
    if(own!==generation||disposed)return;
    const blob=new Blob(chunks,{type:mimeType});release();
    try{
     const bytes=new Uint8Array(await blob.arrayBuffer());
     if(own!==generation||disposed)return;
     if(!bytes.length){fail('capture');return;}
     emit('idle');
     if(own!==generation||disposed){bytes.fill(0);return;}
     try{options.completed({bytes,mimeType});}catch{bytes.fill(0);}
    }catch{if(own===generation&&!disposed)fail('capture');}
   }
   active.start(250);emit('recording');
   if(own===generation&&!disposed&&state.phase==='recording')stopMeter=createBrowserVoiceMeter(acquired,level=>{
    if(own!==generation||disposed||state.phase!=='recording'||state.level===level)return;
    state={...state,level};try{options.changed({...state});}catch{}
   });
   if(own===generation&&!disposed&&state.phase==='recording')cancelTimer=clock.after(60_000,stop);
  }catch(error){
   if(own!==generation||disposed)return;
   const name=error instanceof DOMException?error.name:'';
   fail(name==='NotAllowedError'||name==='SecurityError'?'permission':name==='NotFoundError'||name==='NotReadableError'?'device':'capture');
  }finally{requesting=false;}
 }
 return {start,stop,cancel,snapshot:()=>({...state}),dispose:()=>{
  if(disposed)return;disposed=true;cancel();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leaving);
 }};
}
