export interface InventoryRecoveryScope {userID:string;dealerID:string;recordID:string}
export interface ProtectedInventoryDraftStorage {
 read(key:string):Promise<string|null>;
 write(key:string,value:string):Promise<void>;
 remove(key:string):Promise<void>;
}
const maxBytes=1024*1024;
const ttl=7*24*60*60*1000;
function bounded(text:string):boolean{
 if(text.length>maxBytes)return false;
 let bytes=0;for(const character of text){const code=character.codePointAt(0)!;bytes+=code<128?1:code<2048?2:code<65536?3:4;if(bytes>maxBytes)return false;}return true;
}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function createInventoryRecoveryJournal<T>(port:{scope:InventoryRecoveryScope;storage:ProtectedInventoryDraftStorage;now():number;validate(value:unknown):value is T}){
 const scope=Object.freeze({userID:port.scope.userID,dealerID:port.scope.dealerID,recordID:port.scope.recordID});
 if(Object.values(scope).some(value=>typeof value!=='string'||!value||value.length>128))throw new Error('invalid_inventory_recovery_scope');
 const key=JSON.stringify(['inventory-recovery',1,scope.userID,scope.dealerID,scope.recordID]);
 let closed=false;let tail:Promise<unknown>=Promise.resolve();
 function queue<R>(operation:()=>Promise<R>):Promise<R>{const result=tail.then(operation);tail=result.catch(()=>{});return result;}
 function now(){const time=port.now();if(!Number.isSafeInteger(time)||time<0||time>Number.MAX_SAFE_INTEGER-ttl)throw new Error('invalid_inventory_recovery_clock');return time;}
 return Object.freeze({
  async save(payload:T):Promise<void>{
   if(closed)throw new Error('inventory_recovery_closed');
   const serialized=JSON.stringify(payload);if(typeof serialized!=='string'||!bounded(serialized)||!port.validate(JSON.parse(serialized)))throw new Error('invalid_inventory_recovery_payload');
   return queue(async()=>{const writtenAt=now();const envelope=JSON.stringify({version:1,scope,writtenAt,expiresAt:writtenAt+ttl,payload:JSON.parse(serialized)});if(!bounded(envelope))throw new Error('inventory_recovery_too_large');await port.storage.write(key,envelope);});
  },
  async load():Promise<T|null>{
   if(closed)return null;
   return queue(async()=>{
    if(closed)return null;
    const text=await port.storage.read(key);if(closed||text===null)return null;
    const time=now();let payload:T|null=null;
    try{
     if(bounded(text)){
      const envelope:unknown=JSON.parse(text);
      if(object(envelope)&&envelope.version===1&&object(envelope.scope)&&envelope.scope.userID===scope.userID&&envelope.scope.dealerID===scope.dealerID&&envelope.scope.recordID===scope.recordID&&Number.isSafeInteger(envelope.writtenAt)&&Number.isSafeInteger(envelope.expiresAt)&&typeof envelope.writtenAt==='number'&&envelope.writtenAt>=0&&envelope.writtenAt<=time&&envelope.expiresAt===envelope.writtenAt+ttl&&time<envelope.expiresAt&&port.validate(envelope.payload))payload=envelope.payload;
     }
    }catch{payload=null;}
    if(payload===null)await port.storage.remove(key);
    return closed?null:payload;
   });
  },
  async discard():Promise<void>{closed=true;return queue(()=>port.storage.remove(key));},
 });
}
