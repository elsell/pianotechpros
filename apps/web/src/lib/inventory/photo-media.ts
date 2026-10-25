import {bannerMediaType} from '@pianotechpros/client-core';
/** Browser-only selected bytes and private rendition lifetimes. No transport or credentials. */
export async function readBrowserPhoto(file:File):Promise<Uint8Array>{
 if(!file.size||file.size>20*1024*1024)throw new Error('photo_size');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
 if(!jpeg&&!png)throw new Error('photo_format');
 return bytes;
}
export async function browserPhotoDigest(bytes:Uint8Array):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
 return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function privatePhotoURL(bytes:Uint8Array){
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'image/jpeg'}));
 return {url,dispose:()=>URL.revokeObjectURL(url)};
}

export async function readBrowserBanner(file:File){
 if(!file.size||file.size>20*1024*1024)throw new Error('invalid_banner_source');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const type=bannerMediaType(bytes);if(!type)throw new Error('invalid_banner_source');
 const url=URL.createObjectURL(new Blob([bytes.buffer],{type}));
 try{
  const image=new Image();image.src=url;await image.decode();
  if(image.naturalWidth<1||image.naturalHeight<1||image.naturalWidth>10000||image.naturalHeight>10000||image.naturalWidth*image.naturalHeight>25000000)throw new Error('invalid_banner_source');
  return {bytes,url};
 }catch(error){URL.revokeObjectURL(url);throw error;}
}
