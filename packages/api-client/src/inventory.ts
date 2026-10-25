import { createApiClient } from './client';
import type { TokenProvider } from './transport';
import type { components, operations } from './schema';
export type InventoryListOptions = NonNullable<operations['list-inventory-records']['parameters']['query']>;
export type InventoryPage = {items:InventoryRecord[];nextCursor?:string};

type Schema = components['schemas'];
export type InventoryRecord = Schema['Item'];
export type InventoryAttributes = Schema['Attributes'];
export type InventoryErrorCode = Schema['APIError']['code'] | 'network' | 'protocol_error';
export const knownCodes = new Set<string>([
 'inventory_not_ready','invalid_photo','photo_limit_exceeded','invalid_invitation','bad_request','unauthenticated','invalid_credential','forbidden','not_found','conflict','idempotency_conflict','validation_failed','rate_limited','authorization_pending','authorization_dead_lettered','authorization_policy_not_configured','unavailable','internal_error','request_failed','oidc_discovery_unavailable',
] satisfies Schema['APIError']['code'][]);
export class InventoryClientError extends Error {
 constructor(readonly code: InventoryErrorCode, readonly status: number) { super(code); this.name='InventoryClientError'; }
}
const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
export function validMoney(value: unknown): boolean {
 return value == null || object(value) && Number.isSafeInteger(value.minor_units) && (value.minor_units as number)>=0 && typeof value.currency==='string' && /^[A-Z]{3}$/.test(value.currency);
}
export function validDate(value: unknown): boolean {
 if(value == null)return true;
 if(!object(value))return false;
 const {year,month,day}=value;
 if(typeof year!=='number'||typeof month!=='number'||typeof day!=='number'||!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<1||year>9999||month<0||month>12||day<0)return false;
 if(month===0)return day===0;
 const leap=year%4===0&&(year%100!==0||year%400===0);
 return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]!;
}
function validAttributes(a: unknown): boolean {
 if(!object(a)||typeof a.stock_number!=='string'||!a.stock_number.trim())return false;
 for(const key of ['title','make','model','serial','size','finish','location','description','private_notes'])if(a[key]!==undefined&&typeof a[key]!=='string')return false;
 for(const key of ['featured','player_system','price_visible'])if(a[key]!==undefined&&typeof a[key]!=='boolean')return false;
 if(a.form!==undefined&&(typeof a.form!=='string'||!['','grand','full_size_upright','studio_upright','console','spinet'].includes(a.form)))return false;
 if(a.condition!==undefined&&(typeof a.condition!=='string'||!['','new','used','restored','rebuilt','consignment','other'].includes(a.condition)))return false;
 return validMoney(a.asking_price)&&validMoney(a.acquisition_cost)&&validDate(a.manufactured);
}
export function validRecord(value: unknown, dealerID: string, id?: string): value is InventoryRecord {
 if(!object(value)||typeof value.id!=='string'||!value.id||value.dealer_id!==dealerID||id!==undefined&&value.id!==id||!Number.isSafeInteger(value.revision)||(value.revision as number)<1||typeof value.status!=='string'||!['draft','available','reserved','in_service','sold','archived'].includes(value.status))return false;
 if(typeof value.created_at!=='string'||!Number.isFinite(Date.parse(value.created_at))||typeof value.updated_at!=='string'||!Number.isFinite(Date.parse(value.updated_at)))return false;
 return validAttributes(value.attributes);
}
type Result={response:Response;data?:{data:InventoryRecord};error?:unknown};
async function item(request:()=>Promise<Result>,dealerID:string,id?:string):Promise<InventoryRecord>{
 let result:Result;
 try{result=await request();}catch(error){throw new InventoryClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
 if(!result.response.ok){const candidate=object(result.error)?result.error.code:undefined;throw new InventoryClientError(typeof candidate==='string'&&knownCodes.has(candidate)?candidate as Schema['APIError']['code']:'protocol_error',result.response.status);}
 if(!validRecord(result.data?.data,dealerID,id))throw new InventoryClientError('protocol_error',result.response.status);
 return result.data!.data;
}
type PageResult={response:Response;data?:{data:InventoryRecord[];meta:{nextCursor?:string}};error?:unknown};
async function page(request:()=>Promise<PageResult>,dealerID:string,options:InventoryListOptions):Promise<InventoryPage>{
 let result:PageResult;
 try{result=await request();}catch(error){throw new InventoryClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
 if(!result.response.ok){const candidate=object(result.error)?result.error.code:undefined;throw new InventoryClientError(typeof candidate==='string'&&knownCodes.has(candidate)?candidate as Schema['APIError']['code']:'protocol_error',result.response.status);}
 const body=result.data;const limit=options.limit??30;
 if(!body||!Array.isArray(body.data)||body.data.length>limit||body.data.length>100||!object(body.meta))throw new InventoryClientError('protocol_error',result.response.status);
 const cursor=body.meta.nextCursor;
 if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>4096||cursor&&(!body.data.length||cursor===options.cursor)))throw new InventoryClientError('protocol_error',result.response.status);
 const ids=new Set<string>();
 for(const record of body.data){if(!validRecord(record,dealerID)||ids.has(record.id))throw new InventoryClientError('protocol_error',result.response.status);ids.add(record.id);}
 return {items:body.data,nextCursor:cursor||undefined};
}
export function createInventoryApiClient(baseURL:string,tokenProvider:TokenProvider){
 const client=createApiClient(baseURL,tokenProvider);
 return {
  list:(dealerID:string,options:InventoryListOptions={})=>{
   const snapshot={...options};
   return page(()=>client.GET('/v1/dealers/{dealerID}/inventory',{params:{path:{dealerID},query:snapshot}}),dealerID,snapshot);
  },
  createDraft:(dealerID:string,idempotencyKey:string)=>item(()=>client.POST('/v1/dealers/{dealerID}/inventory',{params:{path:{dealerID},header:{'Idempotency-Key':idempotencyKey}}}),dealerID),
  get:(dealerID:string,id:string)=>item(()=>client.GET('/v1/dealers/{dealerID}/inventory/{id}',{params:{path:{dealerID,id}}}),dealerID,id),
  edit:(dealerID:string,id:string,attributes:InventoryAttributes,expectedRevision:number,voiceFields?:readonly (keyof InventoryAttributes)[])=>{
   const attribution=voiceFields===undefined?{}:{voiceFields:[...voiceFields]};
   const snapshot: InventoryAttributes = { ...attributes,
    asking_price: attributes.asking_price == null ? attributes.asking_price : { ...attributes.asking_price },
    acquisition_cost: attributes.acquisition_cost == null ? attributes.acquisition_cost : { ...attributes.acquisition_cost },
    manufactured: attributes.manufactured == null ? attributes.manufactured : { ...attributes.manufactured },
   };
   return item(()=>client.PUT('/v1/dealers/{dealerID}/inventory/{id}',{params:{path:{dealerID,id}},body:{attributes:snapshot,expectedRevision,...attribution}}),dealerID,id);
  },
 };
}
