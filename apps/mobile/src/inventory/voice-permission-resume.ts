export async function voicePermissionResume(port:{active():boolean;subscribe(changed:()=>void):()=>void;after(ms:number,work:()=>void):()=>void}):Promise<boolean>{
 if(port.active())return true;
 return new Promise(resolve=>{
  let done=false;let unsubscribe=()=>{},cancel=()=>{};
  const finish=(active:boolean)=>{if(done)return;done=true;unsubscribe();cancel();resolve(active);};
  unsubscribe=port.subscribe(()=>{if(port.active())finish(true);});
  if(done){unsubscribe();return;}
  cancel=port.after(1500,()=>finish(port.active()));
  if(done)cancel();else if(port.active())finish(true);
 });
}
export async function resolveVoicePermission(port:{granted():Promise<boolean>;request():Promise<boolean>;resume():Promise<boolean>;backgrounded():void}):Promise<boolean>{
 try{return await port.granted()||await port.request();}
 finally{if(!await port.resume())port.backgrounded();}
}
