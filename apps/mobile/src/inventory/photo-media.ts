import {Directory,File,Paths} from 'expo-file-system';
import {ImageManipulator,SaveFormat,type ImageManipulatorContext,type ImageRef} from 'expo-image-manipulator';
import {getPendingResultAsync,launchCameraAsync,launchImageLibraryAsync,requestCameraPermissionsAsync,type ImagePickerAsset,type ImagePickerResult,type ImagePickerErrorResult} from 'expo-image-picker';
import {CryptoDigestAlgorithm,digest} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {prepareNativePhoto,type NativePickerAsset,type NativePickerResult} from '@pianotechpros/client-core';
import {ownedPhotoCachePath} from './photo-cache-path';
import {createPhotoRenderScope} from './photo-render-scope';

function renderDirectory(){
 return new Directory(Paths.cache,'ImageManipulator');
}
const renderScope=createPhotoRenderScope({
 list:()=>{const directory=renderDirectory();return directory.exists?directory.list().map(entry=>entry.uri):[];},
 owns:uri=>ownedPhotoCachePath(Paths.cache.uri,uri,'rendered'),
 remove:uri=>{const file=new File(uri);if(file.exists)file.delete();},
});

/** The caller supplies only a fresh, scope-bound SDK picker result, never a stored arbitrary URI. */
export async function prepareMobilePhoto(asset:ImagePickerAsset,active:()=>boolean):Promise<Uint8Array> {
 let context:ImageManipulatorContext|undefined;
 let image:ImageRef|undefined;
 function file(uri:string,kind:'picker'|'rendered') {
  if(!ownedPhotoCachePath(Paths.cache.uri,uri,kind))throw new Error('native_photo_invalid');
  return new File(uri);
 }
 return renderScope.run(capture=>prepareNativePhoto(asset,{
  active,
  inspect:async source=>{
   if(source.type&&source.type!=='image')throw new Error('native_photo_invalid');
   return {width:source.width,height:source.height,size:file(source.uri,'picker').size};
  },
  render:async(source,size)=>{
   context=ImageManipulator.manipulate(file(source.uri,'picker').uri);
   context.resize(size);image=await context.renderAsync();
   capture();
   return image.saveAsync({format:SaveFormat.JPEG,compress:0.9,base64:false});
  },
  inspectRendered:async rendered=>({width:rendered.width,height:rendered.height,size:file(rendered.uri,'rendered').size}),
  read:async(rendered,limit)=>{
   const handle=file(rendered.uri,'rendered').open();
   try {
    const size=handle.size;
    if(size===null||!Number.isSafeInteger(size)||size<1||size>limit)throw new Error('native_photo_invalid');
    const bytes=handle.readBytes(size);
    if(bytes.length!==size||handle.readBytes(1).length!==0)throw new Error('native_photo_invalid');
    return bytes;
   } finally {handle.close();}
  },
  release:async source=>{
   let failed=false;
   // Attempt every cleanup even if one native resource fails to release.
   for(const release of [
    ()=>{if(ownedPhotoCachePath(Paths.cache.uri,source.uri,'picker')){const value=file(source.uri,'picker');if(value.exists)value.delete();}},
    ()=>image?.release(),()=>context?.release(),
   ]){try{release();}catch{failed=true;}}
   if(failed)throw new Error('native_photo_unavailable');
  },
 }),active);
}


let pickerHeld=false;
export async function claimMobilePhotoPicker(){
 if(pickerHeld)throw new Error('native_picker_busy');pickerHeld=true;let released=false;
 return ()=>{if(!released){released=true;pickerHeld=false;}};
}
export async function discardMobilePhoto(asset:NativePickerAsset){
 if(!ownedPhotoCachePath(Paths.cache.uri,asset.uri,'picker'))throw new Error('native_picker_unavailable');
 const file=new File(asset.uri);if(file.exists)file.delete();
}
async function pickerResult(result:ImagePickerResult|ImagePickerErrorResult):Promise<NativePickerResult>{
 if('code' in result)throw new Error('native_picker_unavailable');
 if(result.canceled)return {kind:'cancelled'};
 const asset=result.assets[0];
 if(result.assets.length!==1||!asset||(asset.type&&asset.type!=='image')||!ownedPhotoCachePath(Paths.cache.uri,asset.uri,'picker')){
  for(const value of result.assets){if(ownedPhotoCachePath(Paths.cache.uri,value.uri,'picker'))await discardMobilePhoto(value);}
  throw new Error('native_picker_unavailable');
 }
 return {kind:'selected',asset:{uri:asset.uri,width:asset.width,height:asset.height}};
}
export async function pendingMobilePhoto():Promise<NativePickerResult|null>{
 const result=await getPendingResultAsync();return result?pickerResult(result):null;
}
export async function launchMobilePhoto(source:'camera'|'library',active:()=>boolean):Promise<NativePickerResult>{
 if(!active())throw new Error('native_picker_inactive');
 const options={mediaTypes:['images'] as 'images'[],allowsEditing:false,allowsMultipleSelection:false,quality:1,exif:false,base64:false};
 if(source==='camera'){
  const permission=await requestCameraPermissionsAsync();
  if(!active())throw new Error('native_picker_inactive');
  if(!permission.granted)return {kind:'denied'};
  return pickerResult(await launchCameraAsync(options));
 }
 return pickerResult(await launchImageLibraryAsync(options));
}
export async function mobilePhotoDigest(bytes:Uint8Array):Promise<string>{
 const value=await digest(CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes));
 return [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const pickerOwnerKey='inventory_picker_owner_v1';
const pickerOwnerOptions={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export const mobilePickerOwner={
 read:()=>SecureStore.getItemAsync(pickerOwnerKey,pickerOwnerOptions),
 write:async(value:string|null)=>{
  if(value===null)await SecureStore.deleteItemAsync(pickerOwnerKey,pickerOwnerOptions);
  else await SecureStore.setItemAsync(pickerOwnerKey,value,pickerOwnerOptions);
 },
};
