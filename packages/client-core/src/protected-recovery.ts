import {protectedRecoveryMaxBytes} from './recovery-limits';
import type { ProtectedInventoryDraftStorage } from './inventory-recovery';

export interface RecoveryCrypto {
 generate():Promise<{generation:string;key:string}>;
 address(value:string):Promise<string>;
 seal(key:string,additionalData:string,plaintext:string):Promise<string>;
 open(key:string,additionalData:string,ciphertext:string):Promise<string>;
}
interface SecretStorage extends ProtectedInventoryDraftStorage {}
interface CiphertextStorage extends ProtectedInventoryDraftStorage {clear():Promise<void>}
const secretName='inventory_recovery_key_v1';
const cleanupName='inventory_recovery_cleanup_v1';
const unavailable=()=>new Error('inventory_storage_unavailable');
function identity(value:string){if(typeof value!=='string'||!value||value.length>128)throw unavailable();}
function credential(value:string){
 const parsed:unknown=JSON.parse(value);
 if(!parsed||typeof parsed!=='object'||!('generation'in parsed)||!('key'in parsed)||typeof parsed.generation!=='string'||!/^[a-f0-9-]{36}$/.test(parsed.generation)||typeof parsed.key!=='string'||!/^[a-f0-9]{64}$/.test(parsed.key))throw unavailable();
 return {generation:parsed.generation,key:parsed.key};
}
/** One instance per app process. Ports own durable atomic ciphertext replacement. */
export function createProtectedRecovery(port:{secure:SecretStorage;records:CiphertextStorage;crypto:RecoveryCrypto}){
 let epoch=0;let blocked=false;let tail:Promise<unknown>=Promise.resolve();
 function queue<T>(operation:()=>Promise<T>):Promise<T>{
  const result=tail.then(operation).catch(()=>{throw unavailable();});tail=result.catch(()=>{});return result;
 }
 async function cleanup(){
  await port.secure.write(cleanupName,'pending');
  await port.secure.remove(secretName);
  await port.records.clear();
  await port.secure.remove(cleanupName);
  blocked=false;
 }
 return Object.freeze({
  clear():Promise<void>{epoch++;blocked=true;return queue(cleanup);},
  open(userID:string):Promise<ProtectedInventoryDraftStorage>{
   const openedEpoch=epoch;
   return queue(async()=>{
    identity(userID);
    if(blocked||await port.secure.read(cleanupName)!==null)await cleanup();
    if(openedEpoch!==epoch)throw unavailable();
    let serialized=await port.secure.read(secretName);
    if(serialized===null){serialized=JSON.stringify(await port.crypto.generate());credential(serialized);await port.secure.write(secretName,serialized);}
    const captured=serialized;const {generation,key}=credential(captured);
    async function valid(){
     if(blocked||openedEpoch!==epoch||await port.secure.read(cleanupName)!==null||await port.secure.read(secretName)!==captured)throw unavailable();
     if(blocked||openedEpoch!==epoch)throw unavailable();
    }
    function binding(journalKey:string){if(typeof journalKey!=='string'||!journalKey||journalKey.length>2048)throw unavailable();return JSON.stringify([1,userID,generation,journalKey]);}
    return Object.freeze({
     read(journalKey:string){return queue(async()=>{
      await valid();const aad=binding(journalKey);const address=await port.crypto.address(aad);const encrypted=await port.records.read(address);
      const plaintext=encrypted===null?null:await port.crypto.open(key,aad,encrypted);await valid();return plaintext;
     });},
     write(journalKey:string,value:string){return queue(async()=>{
      await valid();const aad=binding(journalKey);if(typeof value!=='string'||value.length>protectedRecoveryMaxBytes||new TextEncoder().encode(value).length>protectedRecoveryMaxBytes)throw unavailable();
      const address=await port.crypto.address(aad);const encrypted=await port.crypto.seal(key,aad,value);await valid();
      await port.records.write(address,encrypted);await valid();
     });},
     remove(journalKey:string){return queue(async()=>{await valid();const address=await port.crypto.address(binding(journalKey));await valid();await port.records.remove(address);});},
    });
   });
  },
 });
}
