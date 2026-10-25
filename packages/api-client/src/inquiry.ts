import createClient from 'openapi-fetch';
import type {components,paths} from './schema';
import {createAuthenticatedFetch,type TokenProvider} from './transport';
import {validPublicListing} from './inventory-publication';

export type BuyerContact=components['schemas']['BuyerContact'];
export type InboxInquiry=components['schemas']['InboxInquiry'];
export type InquirySubmission=Omit<components['schemas']['SubmissionInputBody'],'$schema'>;
export type InquiryPage={inquiries:InboxInquiry[];nextCursor?:string};
export type InquiryErrorCode='invalid_input'|'challenge_rejected'|'unauthenticated'|'not_found'|'conflict'|'rate_limited'|'unavailable'|'network'|'protocol_error';
export class InquiryClientError extends Error{
 constructor(readonly code:InquiryErrorCode,readonly status:number){super(code);this.name='InquiryClientError';}
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number,required=false):value is string=>typeof value==='string'&&value.trim()===value&&[...value].length<=max&&!/\p{Surrogate}/u.test(value)&&(!required||value.length>0);
const single=(value:unknown,max:number,required=false):value is string=>text(value,max,required)&&!/[\p{Cc}]/u.test(value);
const identifier=(value:unknown):value is string=>single(value,128,true)&&!/[/?#\\]/u.test(value);
const exact=(value:Record<string,unknown>,required:string,optional='')=>required.split(' ').every(key=>key in value)&&Object.keys(value).every(key=>`${required} ${optional}`.split(' ').includes(key));
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const utf8Bytes=(value:string)=>[...value].reduce((bytes,char)=>{const code=char.codePointAt(0)!;return bytes+(code<0x80?1:code<0x800?2:code<0x10000?3:4);},0);
const instant=(value:string)=>BigInt(Date.parse(value))*1_000_000n+BigInt((value.match(/\.(\d+)/)?.[1]??'').padEnd(9,'0').slice(3)||'0');
function validContact(value:unknown):value is BuyerContact{
 if(!object(value)||!exact(value,'name email phone message preference')||!single(value.name,120,true)||!single(value.email,254,true)||utf8Bytes(value.email)>254||!value.email.includes('@')||!single(value.phone,40)||!text(value.message,4000,true)||/[\p{Cc}]/u.test(value.message.replace(/[\n\t]/g,'')))return false;
 return typeof value.preference==='string'&&['email','phone','either'].includes(value.preference)&&(value.preference!=='phone'||!!value.phone);
}
export function validInboxInquiry(value:unknown,dealerID:string,id?:string):value is InboxInquiry{
 if(!object(value)||!exact(value,'id dealerName dealerSlug piano contact createdAt revision','readAt readBy')||!identifier(value.id)||id!==undefined&&value.id!==id||!text(value.dealerName,200,true)||typeof value.dealerSlug!=='string'||value.dealerSlug.length>80||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.dealerSlug)||!object(value.piano)||!identifier(value.piano.id)||!validPublicListing(value.piano,dealerID,value.piano.id)||!['available','reserved','sold'].includes(String(value.piano.status))||!validContact(value.contact)||!timestamp(value.createdAt))return false;
 if(value.readAt===undefined)return value.readBy===undefined&&value.revision===1;
 return timestamp(value.readAt)&&instant(value.readAt)>=instant(value.createdAt)&&identifier(value.readBy)&&value.revision===2;
}
type Wire={response:Response;data?:unknown;error?:unknown};
async function execute(run:()=>Promise<Wire>):Promise<Wire>{
 let result:Wire;try{result=await run();}catch(error){throw new InquiryClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
 if(!result.response.ok){const status=result.response.status;const code=object(result.error)?result.error.code:undefined;throw new InquiryClientError(status===401?'unauthenticated':status===404?'not_found':status===409?'conflict':status===429?'rate_limited':status===400&&code==='inquiry_challenge_rejected'?'challenge_rejected':status===400||status===422?'invalid_input':'unavailable',status);}
 return result;
}
const scope=(dealer:string,id?:string)=>{if(!identifier(dealer)||id!==undefined&&!identifier(id))throw new InquiryClientError('invalid_input',0);};
const protocol=()=>new InquiryClientError('protocol_error',200);
export function createPublicInquiryApiClient(baseURL:string){
 const client=createClient<paths>({baseUrl:baseURL,fetch:async(input)=>{const headers=new Headers(input.headers);headers.delete('Authorization');headers.delete('Cookie');return fetch(input,{headers,credentials:'omit',cache:'no-store',redirect:'error'});}});
 return {async submit(slug:string,id:string,body:InquirySubmission,signal?:AbortSignal):Promise<void>{
  scope(slug,id);if(slug.length>80||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new InquiryClientError('invalid_input',0);
  const result=await execute(()=>client.POST('/v1/showrooms/{slug}/pianos/{id}/inquiries',{params:{path:{slug,id}},body,signal}));
  if(result.response.status!==204||result.data!==undefined)throw protocol();
 }};
}
export function createInquiryInboxApiClient(baseURL:string,tokenProvider:TokenProvider){
 const authenticated=createAuthenticatedFetch(tokenProvider);
 const client=createClient<paths>({baseUrl:baseURL,fetch:(input)=>authenticated(input,{credentials:'omit',cache:'no-store',redirect:'error'})});
 const read=(result:Wire,dealerID:string,id:string):InboxInquiry=>{if(!object(result.data)||!validInboxInquiry(result.data.data,dealerID,id))throw protocol();return result.data.data;};
 return {
  async get(dealerID:string,id:string,signal?:AbortSignal):Promise<InboxInquiry>{scope(dealerID,id);return read(await execute(()=>client.GET('/v1/dealers/{dealerID}/inquiries/{id}',{params:{path:{dealerID,id}},signal})),dealerID,id);},
  async markRead(dealerID:string,id:string,revision:number,signal?:AbortSignal):Promise<InboxInquiry>{scope(dealerID,id);if(revision!==1&&revision!==2)throw new InquiryClientError('invalid_input',0);const entry=read(await execute(()=>client.POST('/v1/dealers/{dealerID}/inquiries/{id}/read',{params:{path:{dealerID,id}},body:{revision},signal})),dealerID,id);if(entry.revision!==2)throw protocol();return entry;},
  async list(dealerID:string,cursor?:string,limit=30,signal?:AbortSignal):Promise<InquiryPage>{
   scope(dealerID);if(!Number.isInteger(limit)||limit<1||limit>100||cursor!==undefined&&(!single(cursor,4096,true)||!/^[A-Za-z0-9_-]+$/.test(cursor)))throw new InquiryClientError('invalid_input',0);
   const result=await execute(()=>client.GET('/v1/dealers/{dealerID}/inquiries',{params:{path:{dealerID},query:{cursor,limit}},signal}));const body=result.data;
   if(!object(body)||!Array.isArray(body.data)||body.data.length>limit||!object(body.meta)||Object.keys(body.meta).some(key=>key!=='nextCursor'))throw protocol();
   const seen=new Set<string>();for(const entry of body.data){if(!validInboxInquiry(entry,dealerID)||seen.has(entry.id))throw protocol();seen.add(entry.id);}
   const next=body.meta.nextCursor;if(next!==undefined&&(!single(next,4096,true)||!/^[A-Za-z0-9_-]+$/.test(next)||!body.data.length))throw protocol();
   return {inquiries:body.data,nextCursor:next as string|undefined};
  },
 };
}
