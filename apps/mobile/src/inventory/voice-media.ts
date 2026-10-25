import {AppState,Platform} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,setIsAudioActiveAsync,type AudioRecorder} from 'expo-audio';
import {Directory,File,Paths} from 'expo-file-system';
import {createNativeVoiceCapture,createNativeVoiceCleanup,type NativeVoiceHandle,type NativeVoiceState} from '@pianotechpros/client-core';
import {ownedVoiceCachePath} from './voice-cache-path';
import {voicePermissionResume,resolveVoicePermission} from './voice-permission-resume';

let held=false;
const retiredCaptures=createNativeVoiceCleanup();
type VoiceClock={after(ms:number,work:()=>void):()=>void};
const systemClock:VoiceClock={after:(ms,work)=>{const timer=setTimeout(work,ms);return()=>clearTimeout(timer);}};
function ownedFile(uri:string){if(!ownedVoiceCachePath(Paths.cache.uri,uri))throw Error('native_voice_file');return new File(uri);}
function removeOldAudio(){
 for(const name of ['Audio','ExpoAudio']){const directory=new Directory(Paths.cache,name);if(directory.exists)for(const entry of directory.list())if(entry instanceof File&&ownedVoiceCachePath(Paths.cache.uri,entry.uri))entry.delete();}
}
async function prepare(ended:(failed:boolean)=>void,level:(decibels:number|undefined)=>void,clock:VoiceClock):Promise<NativeVoiceHandle>{
 if(held)throw Error('native_voice_busy');held=true;
 let recorder:AudioRecorder|null=null,uri:string|null=null,released=false,modeReset=false,failed=false;
 let subscription:{remove():void}|null=null;
 let cancelWatch:(()=>void)|null=null,finished=false;
 const unwatch=()=>{cancelWatch?.();cancelWatch=null;};
 const watch=(stopped=false)=>{cancelWatch=clock.after(200,()=>{
  if(released||finished||!recorder)return;
  try{const status=recorder.getStatus();if(!status.isRecording){if(stopped){finished=true;ended(true);}else watch(true);}else {level(status.metering);if(!released&&!finished)watch();}}catch{finished=true;ended(true);}
 });};
 const remember=()=>{if(!released&&recorder?.uri)uri=recorder.uri;};
 const handle:NativeVoiceHandle={
  record:seconds=>{if(failed||released||!recorder)throw Error('native_voice_capture');recorder.record({forDuration:seconds});watch();},
  stop:async()=>{unwatch();finished=true;if(!released&&recorder){if(recorder.isRecording)await recorder.stop();remember();}},
  read:async max=>{
   if(failed||released||!recorder)throw Error('native_voice_capture');remember();if(!uri)throw Error('native_voice_file');
   const file=ownedFile(uri),reader=file.open();try{
    const size=reader.size;if(size===null||!Number.isSafeInteger(size)||size<1||size>max)throw Error('native_voice_size');
    const bytes=reader.readBytes(size);if(bytes.length!==size||reader.readBytes(1).length){bytes.fill(0);throw Error('native_voice_read');}return bytes;
   }finally{reader.close();}
  },
  dispose:async()=>{
   unwatch();finished=true;
   let cleanupFailed=false;
   try{subscription?.remove();subscription=null;}catch{cleanupFailed=true;}
   if(!released&&recorder){try{if(recorder.isRecording)await recorder.stop();}catch{cleanupFailed=true;}try{remember();recorder.release();released=true;}catch{cleanupFailed=true;}}
   if(!modeReset){try{await setAudioModeAsync({allowsRecording:false,allowsBackgroundRecording:false,shouldPlayInBackground:false});await setIsAudioActiveAsync(false);modeReset=true;}catch{cleanupFailed=true;}}
   if(uri){try{const file=ownedFile(uri);if(file.exists)file.delete();uri=null;}catch{cleanupFailed=true;}}
   if(cleanupFailed)throw Error('native_voice_cleanup');held=false;
  },
 };
 try{
  removeOldAudio();
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,allowsBackgroundRecording:false,shouldPlayInBackground:false,interruptionMode:'doNotMix'});
  const preset=RecordingPresets.HIGH_QUALITY;
  const options={...preset,...(Platform.OS==='ios'?preset.ios:preset.android),numberOfChannels:1,sampleRate:44100,bitRate:64000,isMeteringEnabled:true,maxFileSize:6*1024*1024};
  recorder=new AudioModule.AudioRecorder(options);remember();
  subscription=recorder.addListener('recordingStatusUpdate',status=>{if(status.isFinished||status.hasError||status.mediaServicesDidReset){finished=true;unwatch();ended(status.hasError||!!status.mediaServicesDidReset);}});
  await recorder.prepareToRecordAsync();remember();
 }catch{failed=true;}
 // Returning the failed handle lets the controller own and retry all cleanup.
 return handle;
}

export function createMobileVoiceCapture(options:{active():boolean;changed(state:NativeVoiceState):void;completed(bytes:Uint8Array):void;clock?:VoiceClock;backgrounded():void}){
 const controller=createNativeVoiceCapture({...options,recover:()=>retiredCaptures.retry(),active:()=>options.active()&&AppState.currentState!=='background',permission:async()=>{
  if(Platform.OS!=='ios'&&Platform.OS!=='android')return false;
  return resolveVoicePermission({
   granted:async()=>(await AudioModule.getRecordingPermissionsAsync()).granted,
   request:async()=>(await AudioModule.requestRecordingPermissionsAsync()).granted,
   resume:()=>voicePermissionResume({active:()=>AppState.currentState==='active',subscribe:changed=>{const listener=AppState.addEventListener('change',changed);return()=>listener.remove();},after:(options.clock??systemClock).after}),
   backgrounded:options.backgrounded,
  });
 },prepare:(ended,level)=>prepare(ended,level,options.clock??systemClock)});
 const listener=AppState.addEventListener('change',state=>{
  if(state==='background'&&controller.snapshot().phase!=='requesting'||state==='inactive'&&controller.snapshot().phase==='recording')void controller.cancel();
 });
 return {...controller,dispose(){listener.remove();return retiredCaptures.retire(controller);}};
}
