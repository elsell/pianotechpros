import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync, CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync } from 'expo-sqlite';
import { createProtectedRecovery } from '@pianotechpros/client-core';
import { createRecoveryDatabase } from './recovery-database';
import { recoveryBytes } from './recovery-bytes';

const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
let database:ReturnType<typeof createRecoveryDatabase>|undefined;
function records(){
 if(!database)database=openDatabaseAsync('inventory-recovery-v1.db',{useNewConnection:true}).then(async db=>{
  try{return await createRecoveryDatabase(db);}
  catch(error){await db.closeAsync();throw error;}
 }).catch(error=>{database=undefined;throw error;});
 return database;
}
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const vault=createProtectedRecovery({
 secure:{
  read:key=>SecureStore.getItemAsync(key,options),
  write:(key,value)=>SecureStore.setItemAsync(key,value,options),
  remove:key=>SecureStore.deleteItemAsync(key,options),
 },
 records:{
  read:async key=>(await records()).read(key),
  write:async(key,value)=>{await (await records()).write(key,value);},
  remove:async key=>{await (await records()).remove(key);},
  clear:async()=>{await (await records()).clear();},
 },
 crypto:{
  generate:async()=>({generation:randomUUID(),key:await (await AESEncryptionKey.generate()).encoded('hex')}),
  address:value=>digestStringAsync(CryptoDigestAlgorithm.SHA256,value),
  seal:async(key,aad,value)=>{
   const bytes=encoder.encode(value);if(bytes.length>1024*1024)throw new Error('inventory_storage_unavailable');
   const sealed=await aesEncryptAsync(bytes,await AESEncryptionKey.import(key,'hex'),{nonce:{length:12},tagLength:16,additionalData:encoder.encode(aad)});
   return sealed.combined('base64');
  },
  open:async(key,aad,value)=>{
   if(value.length>1400000)throw new Error('inventory_storage_unavailable');
   const bytes=await aesDecryptAsync(AESSealedData.fromCombined(recoveryBytes(value),{ivLength:12,tagLength:16}),await AESEncryptionKey.import(key,'hex'),{additionalData:encoder.encode(aad)});
   return decoder.decode(bytes);
  },
 },
});
export const openMobileInventoryRecovery=vault.open;
export const clearMobileInventoryRecovery=vault.clear;
