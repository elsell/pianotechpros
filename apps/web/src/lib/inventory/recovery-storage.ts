import {protectedRecoveryMaxBytes} from '@pianotechpros/client-core';
import type { ProtectedInventoryDraftStorage } from '@pianotechpros/client-core';
const databaseName='pianotechpros-inventory-recovery';
const limit=protectedRecoveryMaxBytes;
const algorithm='aes-gcm';
const cleanupMarker='pianotechpros_inventory_cleanup_pending';
function requireOpen(){if(localStorage.getItem(cleanupMarker))throw unavailable();}
type Account={userID:string;generation:string;key:CryptoKey};
type Draft={userID:string;journalKey:string;generation:string;nonce:Uint8Array<ArrayBuffer>;ciphertext:ArrayBuffer};
function unavailable():Error{return new Error('inventory_storage_unavailable');}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(unavailable());});}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const r=indexedDB.open(databaseName,1);
 r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('accounts',{keyPath:'userID'});db.createObjectStore('drafts',{keyPath:['userID','journalKey']});db.createObjectStore('meta');};
 r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(unavailable());r.onblocked=()=>reject(unavailable());
});}
async function transaction<T>(stores:string[],mode:IDBTransactionMode,work:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
 const db=await open();try{const tx=db.transaction(stores,mode);const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(unavailable());tx.onabort=()=>reject(unavailable());});
 const operation=work(tx).catch(error=>{try{tx.abort();}catch{}throw error;});const [result]=await Promise.all([operation,done]);return result;
 }finally{db.close();}
}
function validAccount(value:Account|undefined,userID:string):value is Account{return !!value&&value.userID===userID&&typeof value.generation==='string'&&value.key instanceof CryptoKey&&!value.key.extractable&&value.key.algorithm.name.toLowerCase()===algorithm;}
function aad(account:Account,journalKey:string){return new TextEncoder().encode(JSON.stringify([account.userID,account.generation,journalKey]));}
function validJournalKey(key:string){if(typeof key!=='string'||!key||key.length>2048)throw unavailable();}
async function current(account:Account):Promise<boolean>{return transaction(['accounts'],'readonly',async tx=>{const row=await request<Account|undefined>(tx.objectStore('accounts').get(account.userID));return validAccount(row,account.userID)&&row.generation===account.generation;});}
/** Keys and ciphertext share an origin; this does not defend against same-origin code. */
export async function openBrowserInventoryRecovery(userID:string):Promise<ProtectedInventoryDraftStorage>{
 try{
  if(!userID||userID.length>128)throw unavailable();
  if(localStorage.getItem(cleanupMarker))await clearBrowserInventoryRecovery();
  requireOpen();
  const epoch=await transaction(['meta'],'readonly',tx=>request<string|undefined>(tx.objectStore('meta').get('epoch')));
  const key=await crypto.subtle.generateKey({name:algorithm,length:256},false,['encrypt','decrypt']);
  const account=await transaction(['accounts','meta'],'readwrite',async tx=>{
   if(await request<string|undefined>(tx.objectStore('meta').get('epoch'))!==epoch)throw unavailable();
   const existing=await request<Account|undefined>(tx.objectStore('accounts').get(userID));
   if(existing){if(!validAccount(existing,userID))throw unavailable();return existing;}
   const value:Account={userID,generation:crypto.randomUUID(),key};await request(tx.objectStore('accounts').put(value));return value;
  });
  return Object.freeze({
   async read(journalKey:string):Promise<string|null>{try{
    requireOpen();validJournalKey(journalKey);
    const row=await transaction(['accounts','drafts'],'readonly',async tx=>{
     const active=await request<Account|undefined>(tx.objectStore('accounts').get(userID));if(!validAccount(active,userID)||active.generation!==account.generation)throw unavailable();
     return request<Draft|undefined>(tx.objectStore('drafts').get([userID,journalKey]));
    });
    if(!row)return null;
    if(row.userID!==userID||row.journalKey!==journalKey||row.generation!==account.generation||!(row.nonce instanceof Uint8Array)||row.nonce.length!==12||!(row.ciphertext instanceof ArrayBuffer)||row.ciphertext.byteLength>limit+16)throw unavailable();
    const plaintext=await crypto.subtle.decrypt({name:algorithm,iv:row.nonce,additionalData:aad(account,journalKey)},account.key,row.ciphertext);
    if(!await current(account))throw unavailable();requireOpen();return new TextDecoder('utf-8',{fatal:true}).decode(plaintext);
   }catch{throw unavailable();}},
   async write(journalKey:string,value:string):Promise<void>{try{
    requireOpen();validJournalKey(journalKey);const bytes=new TextEncoder().encode(value);if(bytes.length>limit)throw unavailable();
    const nonce=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:algorithm,iv:nonce,additionalData:aad(account,journalKey)},account.key,bytes);
    requireOpen();
    await transaction(['accounts','drafts'],'readwrite',async tx=>{requireOpen();const active=await request<Account|undefined>(tx.objectStore('accounts').get(userID));if(!validAccount(active,userID)||active.generation!==account.generation)throw unavailable();requireOpen();await request(tx.objectStore('drafts').put({userID,journalKey,generation:account.generation,nonce,ciphertext} satisfies Draft));});
   }catch{throw unavailable();}},
   async remove(journalKey:string):Promise<void>{try{
    requireOpen();validJournalKey(journalKey);await transaction(['accounts','drafts'],'readwrite',async tx=>{const active=await request<Account|undefined>(tx.objectStore('accounts').get(userID));if(!active)return;if(!validAccount(active,userID)||active.generation!==account.generation)throw unavailable();await request(tx.objectStore('drafts').delete([userID,journalKey]));});
   }catch{throw unavailable();}},
  });
 }catch{throw unavailable();}
}
export async function clearBrowserInventoryRecovery():Promise<void>{try{
 const cleanupID=crypto.randomUUID();localStorage.setItem(cleanupMarker,cleanupID);
 await transaction(['accounts','drafts','meta'],'readwrite',async tx=>{await request(tx.objectStore('accounts').clear());await request(tx.objectStore('drafts').clear());await request(tx.objectStore('meta').put(crypto.randomUUID(),'epoch'));});
 if(localStorage.getItem(cleanupMarker)===cleanupID)localStorage.removeItem(cleanupMarker);
}catch{throw unavailable();}}
