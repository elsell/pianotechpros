import {createApiClient} from './client';
import type {TokenProvider} from './transport';
import type {components} from './schema';
import {InventoryClientError,knownCodes,type InventoryErrorCode} from './inventory';
export type InventoryScanLabel=components['schemas']['InventoryScanLabel'];
export type InventoryScanResolution=components['schemas']['InventoryScanResolution'];
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&v.length<=128&&/^[A-Za-z0-9_-]+$/.test(v);
const token=(v:unknown):v is string=>typeof v==='string'&&v.length===43&&/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v)&&v!=='A'.repeat(43);
const invalid=()=>new InventoryClientError('validation_failed',0);
export function createInventoryScanApiClient(baseURL:string,tokenProvider:TokenProvider){
 const client=createApiClient(baseURL,tokenProvider);
 async function request(operation:()=>Promise<{response:Response;data?:unknown;error?:unknown}>,dealerID:string,recordID?:string):Promise<InventoryScanLabel|InventoryScanResolution>{
  let result;try{result=await operation();}catch(error){throw new InventoryClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
  if(!result.response.ok){const code=object(result.error)?result.error.code:undefined;throw new InventoryClientError(typeof code==='string'&&knownCodes.has(code)?code as InventoryErrorCode:'protocol_error',result.response.status);}
  const value=object(result.data)?result.data.data:undefined;
  if(!object(value)||value.dealer_id!==dealerID||!id(value.record_id)||recordID!==undefined&&(value.record_id!==recordID||!token(value.token))||Object.keys(value).sort().join(',')!==(recordID===undefined?'dealer_id,record_id':'dealer_id,record_id,token'))throw new InventoryClientError('protocol_error',result.response.status);
  return recordID===undefined?{dealer_id:dealerID,record_id:value.record_id}:{dealer_id:dealerID,record_id:recordID,token:value.token as string};
 }
 return {
  async ensure(dealerID:string,recordID:string,signal?:AbortSignal):Promise<InventoryScanLabel>{
   if(!id(dealerID)||!id(recordID))throw invalid();
   return await request(()=>client.POST('/v1/dealers/{dealerID}/inventory/{id}/scan-label',{params:{path:{dealerID,id:recordID}},signal}),dealerID,recordID) as InventoryScanLabel;
  },
  async resolve(dealerID:string,value:string,signal?:AbortSignal):Promise<InventoryScanResolution>{
   if(!id(dealerID)||!token(value))throw invalid();
   return await request(()=>client.POST('/v1/dealers/{dealerID}/inventory/scan/resolve',{params:{path:{dealerID}},body:{token:value},signal}),dealerID) as InventoryScanResolution;
  },
 };
}
