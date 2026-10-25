import {voiceInputLevel} from '@pianotechpros/client-core';
/** Owns only transient analysis nodes; never plays or retains microphone audio. */
export function createBrowserVoiceMeter(stream:MediaStream,changed:(level:number|null)=>void,open:()=>AudioContext=()=>new AudioContext()){
 let context:AudioContext|null=null,source:MediaStreamAudioSourceNode|null=null,analyser:AnalyserNode|null=null;
 let samples:Float32Array<ArrayBuffer>|null=null,timer:ReturnType<typeof setTimeout>|null=null,closed=false;
 const report=(level:number|null)=>{try{changed(level);}catch{/* Display failure must not retain microphone resources. */}};
 function close(){
  if(closed)return;closed=true;if(timer!==null)clearTimeout(timer);timer=null;
  try{source?.disconnect();}catch{}try{analyser?.disconnect();}catch{}
  source=null;analyser=null;samples?.fill(0);samples=null;
  const old=context;context=null;if(old)void old.close().catch(()=>{});
 }
 function unavailable(){close();report(null);}
 function sample(){
  if(closed||!analyser||!samples||!context)return;
  try{
   if(context.state!=='running'){report(null);}else{
    analyser.getFloatTimeDomainData(samples);let sum=0;for(const value of samples)sum+=value*value;
    const rms=Math.sqrt(sum/samples.length);samples.fill(0);report(voiceInputLevel(20*Math.log10(rms)));
   }
   if(!closed)timer=setTimeout(sample,125);
  }catch{unavailable();}
 }
 try{
  context=open();source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=2048;
  samples=new Float32Array(analyser.fftSize);source.connect(analyser);
  void context.resume().then(()=>{if(!closed)sample();},()=>{if(!closed)unavailable();});
 }catch{unavailable();}
 return close;
}
