import {protectedRecoveryMaxBytes} from './recovery-limits';
import {isCustomerEditorCheckpoint,type CustomerEditorCheckpoint} from './customer-editor';
export interface CustomerRecoveryScope {userID:string;apiBaseURL:string}
export interface ProtectedCustomerDraftStorage {read(key:string):Promise<string|null>;write(key:string,value:string):Promise<void>;remove(key:string):Promise<void>}
export interface CustomerRecoveryResult {checkpoint:CustomerEditorCheckpoint|null;discarded:'expired'|'invalid'|null}
const ttl=7*24*60*60*1000,limit=protectedRecoveryMaxBytes;
const unavailable=()=>new Error('customer_recovery_unavailable');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const bounded=(v:string)=>v.length<=limit&&new TextEncoder().encode(v).length<=limit;
export function createCustomerRecoveryJournal(port:{scope:CustomerRecoveryScope;storage:ProtectedCustomerDraftStorage;zones:ReadonlySet<string>;now():number;active?():boolean}){
 let scope:CustomerRecoveryScope;
 try{const url=new URL(port.scope.apiBaseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||port.scope.apiBaseURL.length>2048||!/^[A-Za-z0-9_-]{1,128}$/.test(port.scope.userID))throw unavailable();scope={userID:port.scope.userID,apiBaseURL:url.origin+url.pathname.replace(/\/+$/,'')};}catch{throw unavailable();}
 const key=JSON.stringify(['customer-profile-recovery',1,scope.apiBaseURL,scope.userID]);
 if(key.length>2048)throw unavailable();
 let closed=false;let tail:Promise<unknown>=Promise.resolve();
 const active=()=>!closed&&(port.active?.()??true);
 function queue<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work);tail=next.catch(()=>{});return next;}
 function now(){const value=port.now();if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-ttl)throw unavailable();return value;}
 return Object.freeze({
  async save(checkpoint:CustomerEditorCheckpoint):Promise<void>{
   if(!active())throw unavailable();let payload:unknown;
   try{const serialized=JSON.stringify(checkpoint);if(!bounded(serialized))throw unavailable();payload=JSON.parse(serialized);if(!isCustomerEditorCheckpoint(payload,port.zones))throw unavailable();}catch{throw unavailable();}
   return queue(async()=>{if(!active())throw unavailable();try{const writtenAt=now();const value=JSON.stringify({version:1,scope,writtenAt,expiresAt:writtenAt+ttl,payload});if(!bounded(value))throw unavailable();await port.storage.write(key,value);}catch{throw unavailable();}});
  },
  async load():Promise<CustomerRecoveryResult>{
   return queue(async()=>{
    if(!active())return {checkpoint:null,discarded:null};
    let raw:string|null;try{raw=await port.storage.read(key);}catch{throw unavailable();}
    if(!active()||raw===null)return {checkpoint:null,discarded:null};
    const at=now();let checkpoint:CustomerEditorCheckpoint|null=null,discarded:CustomerRecoveryResult['discarded']='invalid';
    try{
     if(bounded(raw)){const value:unknown=JSON.parse(raw);
      if(object(value)&&Object.keys(value).sort().join(',')==='expiresAt,payload,scope,version,writtenAt'&&value.version===1&&object(value.scope)&&Object.keys(value.scope).sort().join(',')==='apiBaseURL,userID'&&value.scope.userID===scope.userID&&value.scope.apiBaseURL===scope.apiBaseURL&&typeof value.writtenAt==='number'&&Number.isSafeInteger(value.writtenAt)&&value.writtenAt>=0&&value.writtenAt<=at&&value.writtenAt<=Number.MAX_SAFE_INTEGER-ttl&&value.expiresAt===value.writtenAt+ttl&&isCustomerEditorCheckpoint(value.payload,port.zones)){
       if(at<value.expiresAt){checkpoint=value.payload;discarded=null;}else discarded='expired';
      }
     }
    }catch{/* Invalid serialized data is never exposed. */}
    if(!checkpoint){try{if(active())await port.storage.remove(key);}catch{throw unavailable();}}
    return active()?{checkpoint,discarded}:{checkpoint:null,discarded:null};
   });
  },
  async discard():Promise<void>{closed=true;return queue(async()=>{try{await port.storage.remove(key);}catch{throw unavailable();}});},
  close(){closed=true;},
 });
}
