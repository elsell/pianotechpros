import {createNativePhotoPicker,type NativePickerPort,type NativePickerAsset} from './native-photo-picker';
import {createNativePickerSession} from './native-picker-session';
export interface NativeBannerPickerPort extends Omit<NativePickerPort,'scope'|'accept'>{
 userID:string;dealerID:string;editor:{select(bytes:Uint8Array):boolean;cancel():void};
 prepare(asset:NativePickerAsset):Promise<Uint8Array>;selected(bytes:Uint8Array):void;
}
/** Binds the protected system handoff to local review, never to an upload command. */
export function createNativeBannerPicker(port:NativeBannerPickerPort){
 const {userID,dealerID,editor,prepare,selected,...dependencies}=port;
 const picker=createNativePhotoPicker({...dependencies,scope:{userID,dealerID,targetID:'banner/'+dealerID},
 accept:async asset=>{
  const bytes=await prepare(asset);
  let accepted=false;
  try{
   if(!port.active()||!editor.select(bytes))throw new Error('native_banner_inactive');
   accepted=true;
   if(!port.active())throw new Error('native_banner_inactive');
   selected(bytes);
  }catch(error){if(accepted)editor.cancel();throw error;}
  finally{bytes.fill(0);}
 }});
 return createNativePickerSession({active:port.active,bind:async()=>({picker,release:()=>{}})});
}
