const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Memory-only bridge for native Image; callers release the URI on scope loss. */
export function photoPreviewURI(bytes:Uint8Array):string {
 if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes.length>20*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('photo_preview_unavailable');
 const parts:string[]=[];let chunk='';
 for(let i=0;i<bytes.length;i+=3){
  const a=bytes[i]!;const b=bytes[i+1]??0;const c=bytes[i+2]??0;
  chunk+=alphabet[a>>2]!+alphabet[((a&3)<<4)|(b>>4)]!+(i+1<bytes.length?alphabet[((b&15)<<2)|(c>>6)]!:'=')+(i+2<bytes.length?alphabet[c&63]!:'=');
  if(chunk.length>=8192){parts.push(chunk);chunk='';}
 }
 parts.push(chunk);return 'data:image/jpeg;base64,'+parts.join('');
}
