export interface RetiredNativeVoiceCapture{dispose():Promise<void>;snapshot():{busy:boolean}}
/** Retains only retired resource owners until disposal succeeds, across screen mounts. */
export function createNativeVoiceCleanup(){
 const owners=new Set<RetiredNativeVoiceCapture>(),running=new Map<RetiredNativeVoiceCapture,Promise<void>>();
 function attempt(owner:RetiredNativeVoiceCapture){
  const existing=running.get(owner);if(existing)return existing;
  const job=Promise.resolve().then(async()=>{try{await owner.dispose();if(!owner.snapshot().busy)owners.delete(owner);}catch{/* Keep the resource owner available for explicit retry. */}}).finally(()=>{running.delete(owner);});
  running.set(owner,job);return job;
 }
 return {retire(owner:RetiredNativeVoiceCapture){owners.add(owner);return attempt(owner);},async retry(){await Promise.all([...owners].map(attempt));return owners.size===0;}};
}
