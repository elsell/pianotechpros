import {Directory,File,Paths} from 'expo-file-system';
import {ImageManipulator,SaveFormat,type ImageManipulatorContext,type ImageRef} from 'expo-image-manipulator';
import type {ImagePickerAsset} from 'expo-image-picker';
import {prepareNativePhoto} from '@pianotechpros/client-core';
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
