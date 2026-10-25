import {createApiClient} from './client';
import type {TokenProvider} from './transport';
import type {components} from './schema';
import {InventoryClientError,knownCodes,validMoney,type InventoryErrorCode} from './inventory';
export type InventoryHistoryEntry=components['schemas']['InventoryHistoryEntry'];
export type InventoryHistoryPage={items:InventoryHistoryEntry[];nextCursor?:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number,required=false):v is string=>typeof v==='string'&&v.trim()===v&&[...v].length<=max&&(!required||!!v)&&!/[\u0000-\u001f\u007f]/.test(v);
const attributes=['stock_number','title','featured','form','player_system','condition','make','model','serial','manufactured','size','finish','asking_price','price_visible','location','description','acquisition_cost','private_notes'];
const statuses=['draft','available','reserved','in_service','sold','archived'];
function validEntry(v:unknown):v is InventoryHistoryEntry {
 if(!object(v)||Object.keys(v).some(key=>!['revision','actor_id','kind','source','fields','field_sources','occurred_at','from','to','sale_price','reason'].includes(key)))return false;
 if(!Number.isSafeInteger(v.revision)||(v.revision as number)<1||!text(v.actor_id,128,true)||!['manual','voice','mixed'].includes(v.source as string)||typeof v.occurred_at!=='string'||!Number.isFinite(Date.parse(v.occurred_at)))return false;
 if(!Array.isArray(v.fields)||v.fields.length>18||new Set(v.fields).size!==v.fields.length||v.fields.some(f=>typeof f!=='string'))return false;
 if(v.field_sources!==null&&!object(v.field_sources))return false;
 if(v.reason!==undefined&&(typeof v.reason!=='string'||v.reason.trim()!==v.reason||[...v.reason].length>1000))return false;
 const fields=v.fields as string[];
 if(v.kind==='attributes'){
  if(!fields.length||fields.some(f=>!attributes.includes(f))||v.from!==undefined||v.to!==undefined||v.reason!==undefined||v.sale_price!==undefined)return false;
  if(v.field_sources===null)return v.source!=='mixed';
  const origins=v.field_sources as Record<string,unknown>;
  if(Object.keys(origins).length!==fields.length||fields.some(f=>!['manual','voice'].includes(origins[f] as string)))return false;
  const voice=fields.filter(f=>origins[f]==='voice').length;
  return v.source===(voice===0?'manual':voice===fields.length?'voice':'mixed');
 }
 if(v.source!=='manual'||v.field_sources!==null)return false;
 if(v.kind==='lifecycle'){
  if(!statuses.includes(v.from as string)||!statuses.includes(v.to as string)||fields.join(',')!==(v.to==='sold'?'status,sale_price':'status'))return false;
  if(v.to==='sold')return object(v.sale_price)&&Object.keys(v.sale_price).sort().join(',')==='currency,minor_units'&&validMoney(v.sale_price);
  return v.sale_price===undefined;
 }
 if(v.reason!==undefined||v.sale_price!==undefined)return false;
 if(v.kind==='publish')return statuses.includes(v.from as string)&&['available','reserved','sold'].includes(v.to as string)&&fields.join(',')===(v.from===v.to?'publication':'publication,status');
 if(v.from!==undefined||v.to!==undefined)return false;
 return v.kind==='created'?v.revision===1&&fields.length===0:v.kind==='photos'?fields.join(',')==='photos':v.kind==='unpublish'&&fields.join(',')==='publication';
}
export function createInventoryHistoryApiClient(baseURL:string,tokenProvider:TokenProvider){
 const client=createApiClient(baseURL,tokenProvider);
 return {async list(dealerID:string,id:string,cursor?:string,signal?:AbortSignal):Promise<InventoryHistoryPage>{
  if(!text(dealerID,128,true)||!text(id,128,true)||cursor!==undefined&&(!text(cursor,4096,true)))throw new InventoryClientError('validation_failed',0);
  let result;
  try{result=await client.GET('/v1/dealers/{dealerID}/inventory/{id}/history',{params:{path:{dealerID,id},query:{limit:20,...(cursor?{cursor}:{})}},signal});}catch(error){throw new InventoryClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
  if(!result.response.ok){const code=object(result.error)?result.error.code:undefined;throw new InventoryClientError(typeof code==='string'&&knownCodes.has(code)?code as InventoryErrorCode:'protocol_error',result.response.status);}
  const body:unknown=result.data;
  if(!object(body)||!Array.isArray(body.data)||body.data.length>20||!object(body.meta))throw new InventoryClientError('protocol_error',result.response.status);
  let prior=Number.MAX_SAFE_INTEGER+1;
  for(const entry of body.data){if(!validEntry(entry)||entry.revision>=prior)throw new InventoryClientError('protocol_error',result.response.status);prior=entry.revision;}
  const next=body.meta.nextCursor;
  if(next!==undefined&&(!text(next,4096,true)||next===cursor||!body.data.length||prior===1))throw new InventoryClientError('protocol_error',result.response.status);
  return {items:body.data as InventoryHistoryEntry[],...(typeof next==='string'?{nextCursor:next}:{})};
 }};
}
