export interface BannerMetadata {id:string;width:number;height:number}
export interface BannerProfile {id:string;revision:number}
export interface BannerState<P extends BannerProfile> {profile:P;banner:BannerMetadata|null}
export type BannerPhase='idle'|'upload-review'|'remove-review'|'upload-uncertain'|'refresh-required';
export interface BannerEditorState<P extends BannerProfile>{
 current:BannerState<P>|null;phase:BannerPhase;busy:boolean;hasSelection:boolean;
 denied:boolean;failure:unknown;notice:'uploaded'|'removed'|'superseded'|null;
}
export function createDealerBanner<P extends BannerProfile>(port:{
 dealerID:string;initial:BannerState<P>|null;key():string;
 load(signal:AbortSignal):Promise<BannerState<P>>;
 upload(bytes:Uint8Array,key:string,revision:number,signal:AbortSignal):Promise<BannerState<P>&{bannerID:string;replay:boolean}>;
 remove(revision:number,signal:AbortSignal):Promise<BannerState<P>>;
 denied(error:unknown):boolean;conflict(error:unknown):boolean;rejected(error:unknown):boolean;
}){
 const empty=():BannerEditorState<P>=>({current:null,phase:'idle',busy:false,hasSelection:false,denied:false,failure:null,notice:null});
 function checked(value:BannerState<P>,minimum=1):BannerState<P>{
  if(value.profile.id!==port.dealerID||!Number.isSafeInteger(value.profile.revision)||value.profile.revision<minimum)throw new Error('invalid_banner_scope');
  return Object.freeze({profile:Object.freeze({...value.profile}),banner:value.banner?Object.freeze({...value.banner}):null});
 }
 let state:BannerEditorState<P>=Object.freeze({...empty(),current:port.initial?checked(port.initial):null});
 let selected:Uint8Array|null=null;
 let intent:{key:string;revision:number}|null=null;
 let disposed=false,sequence=0;
 let active:AbortController|null=null;
 let operation:'upload'|'remove'|'refresh'|null=null;
 const listeners=new Set<(state:BannerEditorState<P>)=>void>();
 function publish(patch:Partial<BannerEditorState<P>>){
  if(disposed)return;
  state=Object.freeze({...state,...patch,hasSelection:selected!==null});
  for(const listener of listeners)listener(state);
 }
 function clear(){selected=null;intent=null;}
 function start(kind:typeof operation){
  const controller=new AbortController();active=controller;operation=kind;
  const id=++sequence;
  publish({busy:true,failure:null,notice:null});
  return {signal:controller.signal,current:()=>!disposed&&id===sequence};
 }
 function finish(){active=null;operation=null;publish({busy:false});}
 function failed(error:unknown,kind:'upload'|'remove'|'refresh'){
  if(port.denied(error)){clear();publish({current:null,denied:true,phase:'refresh-required',failure:error});return;}
  if(kind==='upload'){
   if(port.conflict(error)){intent=null;publish({phase:'refresh-required',failure:error});}
   else if(port.rejected(error)){intent=null;publish({phase:'upload-review',failure:error});}
   else publish({phase:'upload-uncertain',failure:error});
  }else publish({phase:'refresh-required',failure:error});
 }
 return Object.freeze({
  snapshot:()=>state,
  subscribe(listener:(state:BannerEditorState<P>)=>void){if(disposed)return()=>{};listeners.add(listener);listener(state);return()=>{listeners.delete(listener);};},
  select(source:Uint8Array){
   if(disposed||state.busy||state.denied||!state.current||state.phase==='upload-uncertain'||state.phase==='refresh-required')return false;
   if(source.byteLength<1||source.byteLength>20*1024*1024)throw new Error('invalid_banner_source');
   selected=new Uint8Array(source);intent=null;publish({phase:'upload-review',failure:null,notice:null});return true;
  },
  cancel(){
   if(disposed||state.busy)return;
   const uncertain=state.phase==='upload-uncertain'||state.phase==='refresh-required';
   clear();publish({phase:uncertain?'refresh-required':'idle',failure:null,notice:null});
  },
  async refresh(){
   if(disposed||state.busy)return;
   const pending=start('refresh'),minimum=state.current?.profile.revision??1;
   try{
    if(!pending.current()||pending.signal.aborted)return;
    const result=await port.load(pending.signal);if(!pending.current())return;
    const current=checked(result,minimum);intent=null;
    publish({current,phase:selected?'upload-review':'idle',denied:false});
   }catch(error){if(pending.current())failed(error,'refresh');}
   finally{if(pending.current())finish();}
  },
  async confirmUpload(){
   if(disposed||state.busy||state.denied||!selected||!state.current||!['upload-review','upload-uncertain'].includes(state.phase))return;
   const pending=start('upload');
   try{
    if(!pending.current()||pending.signal.aborted)return;
    if(!intent){
     const revision=state.current!.profile.revision,key=port.key();
     if(!pending.current()||pending.signal.aborted)return;
     intent={key,revision};
    }
    if(!pending.current()||pending.signal.aborted)return;
    const result=await port.upload(new Uint8Array(selected),intent.key,intent.revision,pending.signal);
    if(!pending.current())return;
    const current=checked(result,result.replay?intent.revision:intent.revision+1);
    if(!result.replay&&current.banner?.id!==result.bannerID)throw new Error('invalid_banner_acknowledgement');
    const superseded=current.banner?.id!==result.bannerID;
    clear();publish({current,phase:'idle',notice:superseded?'superseded':'uploaded'});
   }catch(error){if(pending.current())failed(error,'upload');}
   finally{if(pending.current())finish();}
  },
  reviewRemoval(){
   if(disposed||state.busy||state.denied||!state.current?.banner||state.phase!=='idle')return false;
   clear();publish({phase:'remove-review',failure:null,notice:null});return true;
  },
  async confirmRemoval(){
   if(disposed||state.busy||state.denied||!state.current?.banner||state.phase!=='remove-review')return;
   const revision=state.current.profile.revision,pending=start('remove');
   try{
    if(!pending.current()||pending.signal.aborted)return;
    const result=await port.remove(revision,pending.signal);if(!pending.current())return;
    const current=checked(result,revision+1);if(current.banner!==null)throw new Error('invalid_banner_removal');
    clear();publish({current,phase:'idle',notice:'removed'});
   }catch(error){if(pending.current())failed(error,'remove');}
   finally{if(pending.current())finish();}
  },
  interrupt(){
   if(disposed||!active)return;
   const previous=operation;sequence++;active.abort();active=null;operation=null;
   publish({busy:false,phase:previous==='upload'?'upload-uncertain':'refresh-required'});
  },
  dispose(){
   if(disposed)return;
   disposed=true;sequence++;active?.abort();active=null;operation=null;clear();state=Object.freeze(empty());listeners.clear();
  },
 });
}

// Preview accepts raster signatures only; the server still validates every pixel.
export function bannerMediaType(bytes:Uint8Array):'image/jpeg'|'image/png'|'image/webp'|null{
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
 if(bytes.length>=12&&[82,73,70,70].every((v,i)=>bytes[i]===v)&&[87,69,66,80].every((v,i)=>bytes[i+8]===v))return 'image/webp';
 return null;
}
