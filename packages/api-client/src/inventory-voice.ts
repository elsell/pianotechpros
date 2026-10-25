import createClient from 'openapi-fetch';
import type {components,paths} from './schema';
import {createAuthenticatedFetch,type TokenProvider} from './transport';
import {validDate,validMoney} from './inventory';
export type VoiceProposal=components['schemas']['VoiceProposal'];
export type VoiceTranscript=components['schemas']['VoiceTranscript'];
export type VoiceErrorCode='invalid_input'|'cancelled'|'unauthenticated'|'not_found'|'conflict'|'rate_limited'|'unavailable'|'network'|'protocol_error';
export class VoiceClientError extends Error{constructor(readonly code:VoiceErrorCode,readonly status:number){super(code);this.name='VoiceClientError';}}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v&&[...v].length<=max&&!/\p{Surrogate}/u.test(v);
const identifier=(v:unknown):v is string=>text(v,128)&&!/[\p{Cc}/?#\\]/u.test(v);
const textFields:Record<string,number>={stock_number:80,title:240,form:80,condition:80,make:160,model:160,serial:160,size:80,finish:200,location:200,description:10000,private_notes:10000};
const currencies=['USD','CAD','EUR','GBP','AUD','NZD','JPY','CHF'];
function validProposal(value:unknown,revision:number,transcript:string):value is VoiceProposal{
 if(!object(value)||!exact(value,['revision','transcript','candidates'])||value.revision!==revision||value.transcript!==transcript||!Array.isArray(value.candidates)||value.candidates.length>18)return false;
 const seen=new Set<string>();
 for(const c of value.candidates){
  if(!object(c)||!exact(c,['field','value','confidence','evidence'])||typeof c.field!=='string'||seen.has(c.field)||!object(c.value)||!text(c.evidence,600)||!transcript.includes(c.evidence)||(c.confidence!=='high'&&c.confidence!=='uncertain'))return false;
  seen.add(c.field);
  if(Object.hasOwn(textFields,c.field)){
   if(!exact(c.value,['text'])||!text(c.value.text,textFields[c.field]!))return false;
   if(c.field==='form'&&!['grand','full_size_upright','studio_upright','console','spinet'].includes(c.value.text))return false;
   if(c.field==='condition'&&!['new','used','restored','rebuilt','consignment','other'].includes(c.value.text))return false;
  }else if(['featured','player_system','price_visible'].includes(c.field)){
   if(!exact(c.value,['boolean'])||typeof c.value.boolean!=='boolean')return false;
  }else if(['asking_price','acquisition_cost'].includes(c.field)){
   const m=c.value.money;if(!exact(c.value,['money'])||!object(m)||!exact(m,['minor_units','currency'])||!validMoney(m)||typeof m.currency!=='string'||!currencies.includes(m.currency))return false;
  }else if(c.field==='manufactured'){
   const d=c.value.date;if(!exact(c.value,['date'])||!object(d)||!exact(d,['year','month','day'])||!validDate(d))return false;
  }else return false;
 }
 return true;
}
function scope(dealerID:string,id:string,revision:number,signal?:AbortSignal){
 if(signal?.aborted)throw new VoiceClientError('cancelled',0);
 if(!identifier(dealerID)||!identifier(id)||!Number.isSafeInteger(revision)||revision<1)throw new VoiceClientError('invalid_input',0);
}
const audioTypes=new Set(['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/mp4','audio/mp4;codecs=mp4a.40.2','audio/x-m4a','audio/m4a','audio/aac','audio/wav','audio/x-wav','audio/mpeg','audio/mp3']);
type Wire={response:Response;data?:unknown;error?:unknown};
async function request(run:()=>Promise<Wire>,signal?:AbortSignal):Promise<unknown>{
 let result:Wire;try{result=await run();}catch(error){throw new VoiceClientError(signal?.aborted?'cancelled':error instanceof SyntaxError?'protocol_error':'network',0);}
 if(signal?.aborted)throw new VoiceClientError('cancelled',0);
 const status=result.response.status;
 if(!result.response.ok)throw new VoiceClientError(status===401?'unauthenticated':status===403||status===404?'not_found':status===409?'conflict':status===429?'rate_limited':status===400||status===413||status===415||status===422?'invalid_input':'unavailable',status);
 if(status!==200||!object(result.data))throw new VoiceClientError('protocol_error',status);
 return result.data.data;
}
export function createInventoryVoiceApiClient(baseURL:string,tokenProvider:TokenProvider){
 const authenticated=createAuthenticatedFetch(tokenProvider);
 const client=createClient<paths>({baseUrl:baseURL,fetch:input=>authenticated(input,{credentials:'omit',cache:'no-store',redirect:'error'})});
 return {
  async transcribe(dealerID:string,id:string,revision:number,source:Uint8Array,mimeType:string,signal?:AbortSignal):Promise<VoiceTranscript>{
   scope(dealerID,id,revision,signal);
   if(!(source instanceof Uint8Array)||!source.byteLength||source.byteLength>6*1024*1024||!audioTypes.has(mimeType))throw new VoiceClientError('invalid_input',0);
   const bytes=new Uint8Array(source).buffer;
   const data=await request(()=>client.POST('/v1/dealers/{dealerID}/inventory/{id}/voice/transcribe',{params:{path:{dealerID,id},query:{expectedRevision:revision},header:{'Content-Type':mimeType}},body:'',bodySerializer:()=>bytes,headers:{'Content-Type':mimeType},signal}),signal);
   if(!object(data)||!exact(data,['revision','transcript'])||data.revision!==revision||!text(data.transcript,16000))throw new VoiceClientError('protocol_error',200);
   return data as VoiceTranscript;
  },
  async extract(dealerID:string,id:string,revision:number,transcript:string,signal?:AbortSignal):Promise<VoiceProposal>{
   scope(dealerID,id,revision,signal);if(!text(transcript,16000))throw new VoiceClientError('invalid_input',0);
   const data=await request(()=>client.POST('/v1/dealers/{dealerID}/inventory/{id}/voice/extract',{params:{path:{dealerID,id}},body:{expectedRevision:revision,transcript},signal}),signal);
   if(!validProposal(data,revision,transcript))throw new VoiceClientError('protocol_error',200);return data;
  },
 };
}
