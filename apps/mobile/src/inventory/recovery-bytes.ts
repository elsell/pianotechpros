function digit(character:string):number{
 const code=character.charCodeAt(0);
 if(code>=65&&code<=90)return code-65;
 if(code>=97&&code<=122)return code-71;
 if(code>=48&&code<=57)return code+4;
 return code===43?62:63;
}
/** Decode the persisted AES-GCM envelope for native constructors requiring bytes. */
export function recoveryBytes(value:string):Uint8Array{
 const fail=()=>{throw new Error('inventory_storage_unavailable');};
 if(value.length<40||value.length>1400000||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return fail();
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
 const bytes=new Uint8Array(value.length/4*3-padding);let offset=0;
 for(let i=0;i<value.length;i+=4){
  const a=digit(value[i]),b=digit(value[i+1]);
  const c=value[i+2]==='='?0:digit(value[i+2]),d=value[i+3]==='='?0:digit(value[i+3]);
  if(i===value.length-4&&((padding===2&&(b&15)!==0)||(padding===1&&(c&3)!==0)))return fail();
  bytes[offset++]=(a<<2)|(b>>4);
  if(offset<bytes.length)bytes[offset++]=((b&15)<<4)|(c>>2);
  if(offset<bytes.length)bytes[offset++]=((c&3)<<6)|d;
 }
 return bytes;
}
