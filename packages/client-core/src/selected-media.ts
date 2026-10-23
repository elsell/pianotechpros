import type {InventoryRecoveryScope, ProtectedInventoryDraftStorage} from './inventory-recovery';

const chunkSize = 256 * 1024;
const maxBytes = 20 * 1024 * 1024;
const maxChunks = maxBytes / chunkSize;
const unavailable = () => new Error('selected_media_unavailable');
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function identity(value: string) {
 if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 128) throw unavailable();
}
function commitment(text:string){
 if(text.length>200)throw unavailable();
 const value:unknown=JSON.parse(text);
 if(!object(value)||value.version!==1||typeof value.size!=='number'||!Number.isSafeInteger(value.size)||value.size<1||value.size>maxBytes||typeof value.sha256!=='string'||!/^[0-9a-f]{64}$/.test(value.sha256))throw unavailable();
 return {version:1,size:value.size,sha256:value.sha256};
}
function manifest(text: string) {
 if (text.length > 200) throw unavailable();
 const value: unknown = JSON.parse(text);
 if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.size) || typeof value.size !== 'number' || value.size < 1 || value.size > maxBytes || value.chunkSize !== chunkSize || value.chunks !== Math.ceil(value.size / chunkSize)) throw unavailable();
 return {version:1,size:value.size,chunkSize,chunks:Math.ceil(value.size/chunkSize)};
}
const hex = Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0'));
function encode(bytes: Uint8Array) {
 const parts = new Array<string>(bytes.length);
 for (let i=0;i<bytes.length;i++) parts[i]=hex[bytes[i]!]!;
 return parts.join('');
}
function decode(text: string, size: number, index: number) {
 if (text.length > chunkSize*2+200) throw unavailable();
 const value: unknown = JSON.parse(text);
 const length = Math.min(chunkSize,size-index*chunkSize);
 if (!object(value) || value.version !== 1 || value.size !== size || value.index !== index || typeof value.data !== 'string' || value.data.length !== length*2 || !/^[0-9a-f]+$/.test(value.data)) throw unavailable();
 const bytes = new Uint8Array(length);
 for (let i=0;i<length;i++) bytes[i]=parseInt(value.data.slice(i*2,i*2+2),16);
 return bytes;
}
/** Caller holds exclusive scope ownership and reserves each ID durably first. */
export function createSelectedMediaStore(port: {scope:InventoryRecoveryScope;storage:ProtectedInventoryDraftStorage;sha256(bytes:Uint8Array):Promise<string>}) {
 const scope = Object.freeze({userID:port.scope.userID,dealerID:port.scope.dealerID,recordID:port.scope.recordID});
 for (const value of Object.values(scope)) identity(value);
 let tail: Promise<unknown> = Promise.resolve();
 function queue<T>(run:()=>Promise<T>):Promise<T> {
  const result=tail.then(run).catch(()=>{throw unavailable();});
  tail=result.catch(()=>{});return result;
 }
 function key(id:string,part:'manifest'|'chunk'|'commitment',index?:number) {
  return JSON.stringify(['inventory-selected-media',1,scope.userID,scope.dealerID,scope.recordID,id,part,...(index===undefined?[]:[index])]);
 }
 async function read(id:string) {
  const raw=await port.storage.read(key(id,'manifest'));
  if(raw===null)return null;
  const meta=manifest(raw);const bytes=new Uint8Array(meta.size);
  for(let index=0;index<meta.chunks;index++){
   const row=await port.storage.read(key(id,'chunk',index));if(row===null)throw unavailable();
   bytes.set(decode(row,meta.size,index),index*chunkSize);
  }
  const sealed=await port.storage.read(key(id,'commitment'));if(sealed===null)throw unavailable();
  const expected=commitment(sealed);
  if(expected.size!==bytes.length||await port.sha256(bytes)!==expected.sha256)throw unavailable();
  // Revalidate the vault generation after asynchronous hashing before disclosure.
  if(await port.storage.read(key(id,'commitment'))!==sealed)throw unavailable();
  return bytes;
 }
 return Object.freeze({
  async put(id:string,source:Uint8Array):Promise<void>{
   identity(id);if(!(source instanceof Uint8Array)||source.byteLength<1||source.byteLength>maxBytes)throw unavailable();
   const bytes=new Uint8Array(source);
   return queue(async()=>{
    const digest=await port.sha256(bytes);
    const committed=JSON.stringify({version:1,size:bytes.length,sha256:digest});
    commitment(committed);
    const priorCommitment=await port.storage.read(key(id,'commitment'));
    if(priorCommitment!==null){
     const expected=commitment(priorCommitment);
     if(expected.size!==bytes.length||expected.sha256!==digest)throw unavailable();
    }else await port.storage.write(key(id,'commitment'),committed);
    const existing=await port.storage.read(key(id,'manifest'));
    const meta={version:1,size:bytes.length,chunkSize,chunks:Math.ceil(bytes.length/chunkSize)};
    if(existing!==null){
     if(manifest(existing).size!==bytes.length)throw unavailable();
     const saved=await read(id);if(!saved||saved.some((value,i)=>value!==bytes[i]))throw unavailable();
     return;
    }
    for(let index=0;index<meta.chunks;index++){
     const row=JSON.stringify({version:1,size:bytes.length,index,data:encode(bytes.subarray(index*chunkSize,(index+1)*chunkSize))});
     const address=key(id,'chunk',index);const prior=await port.storage.read(address);
     if(prior!==null&&prior!==row)throw unavailable();
     if(prior===null)await port.storage.write(address,row);
    }
    await port.storage.write(key(id,'manifest'),JSON.stringify(meta));
   });
  },
  async read(id:string):Promise<Uint8Array|null>{identity(id);return queue(()=>read(id));},
  async remove(id:string):Promise<void>{
   identity(id);return queue(async()=>{
    let failed=false;
    try{await port.storage.remove(key(id,'manifest'));}catch{failed=true;}
    for(let index=0;index<maxChunks;index++){
     try{await port.storage.remove(key(id,'chunk',index));}catch{failed=true;}
    }
    if(failed)throw unavailable();
    await port.storage.remove(key(id,'commitment'));
   });
  },
 });
}
