interface ImageMetadata {width:number;height:number;size:number}
interface ImageDimensions {width:number;height:number}
export interface NativePhotoPreparationPort<Source,Rendered> {
 active():boolean;
 inspect(source:Source):Promise<ImageMetadata>;
 render(source:Source,size:ImageDimensions):Promise<Rendered>;
 inspectRendered(rendered:Rendered):Promise<ImageMetadata>;
 /** Must enforce the limit while reading, not after an unbounded allocation. */
 read(rendered:Rendered,limit:number):Promise<Uint8Array>;
 /** Releases only resources owned by the native adapter, including partial work. */
 release(source:Source,rendered:Rendered|undefined):Promise<void>;
}
class PreparationError extends Error {}
const invalid=()=>new PreparationError('native_photo_invalid');
const outputLimit=20*1024*1024;
function validMetadata(value:ImageMetadata,axis:number,pixels:number,size:number) {
 return [value.width,value.height,value.size].every(n=>Number.isSafeInteger(n)&&n>0)&&
  value.width<=axis&&value.height<=axis&&value.width*value.height<=pixels&&value.size<=size;
}
/** Framework-free admission and lifetime boundary; this does not replace server decoding. */
export async function prepareNativePhoto<Source,Rendered>(source:Source,port:NativePhotoPreparationPort<Source,Rendered>):Promise<Uint8Array> {
 let rendered:Rendered|undefined;
 const active=()=>{if(!port.active())throw new PreparationError('native_photo_inactive');};
 try {
  let result:Uint8Array;
  try {
   active();
   const input=await port.inspect(source);active();
   if(!validMetadata(input,12000,60_000_000,50*1024*1024))throw invalid();
   const scale=Math.min(1,4096/Math.max(input.width,input.height));
   const size={width:Math.max(1,Math.round(input.width*scale)),height:Math.max(1,Math.round(input.height*scale))};
   rendered=await port.render(source,size);active();
   const output=await port.inspectRendered(rendered);active();
   if(!validMetadata(output,4096,4096*4096,outputLimit)||output.width!==size.width||output.height!==size.height)throw invalid();
   const bytes=await port.read(rendered,outputLimit);active();
   if(!(bytes instanceof Uint8Array)||bytes.length!==output.size||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw invalid();
   result=new Uint8Array(bytes);
  } finally {await port.release(source,rendered);}
  active();return result;
 } catch(error) {
  if(error instanceof PreparationError)throw error;
  throw new Error('native_photo_unavailable');
 }
}
