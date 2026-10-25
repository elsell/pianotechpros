import {createApiClient} from './client';
import type {TokenProvider} from './transport';
import type {components} from './schema';
import {DealerClientError,dealerErrorCodes,type DealerErrorCode} from './dealer';

export type DealerBannerState=components['schemas']['DealerBannerState'];
export type DealerBannerUpload=DealerBannerState&{bannerID:string;replay:boolean};
const base='/v1/dealers/{id}/banner' as const;
const limit=20*1024*1024;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validID=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&v.trim()===v&&!/[/?#\\\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const revision=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=1;
function validState(value:unknown,dealerID:string):value is DealerBannerState{
 if(!object(value)||!exact(value,['profile','banner'])||!object(value.profile))return false;
 const p=value.profile;
 if(p.id!==dealerID||!revision(p.revision)||typeof p.name!=='string'||!p.name.trim()||typeof p.slug!=='string'||typeof p.email!=='string'||typeof p.accent_color!=='string'||typeof p.showroom_published!=='boolean')return false;
 const b=value.banner;
 return b===null||object(b)&&exact(b,['id','width','height'])&&validID(b.id)&&revision(b.width)&&revision(b.height)&&Number(b.width)<=10000&&Number(b.height)<=10000&&Number(b.width)*Number(b.height)<=25000000;
}
type Wire={response:Response;data?:unknown;error?:unknown};
const invalid=()=>new DealerClientError('protocol_error',200);
async function request(run:()=>Promise<Wire>):Promise<Wire>{
 let result:Wire;
 try{result=await run();}catch(error){throw new DealerClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
 if(!result.response.ok){
 const code=object(result.error)?result.error.code:undefined;
 throw new DealerClientError(typeof code==='string'&&dealerErrorCodes.has(code)?code as DealerErrorCode:'protocol_error',result.response.status);
 }
 return result;
}
function state(result:Wire,dealerID:string):DealerBannerState{
 if(!object(result.data)||!validState(result.data.data,dealerID))throw invalid();
 return result.data.data;
}
function scope(dealerID:string,expected?:number){
 if(!validID(dealerID)||expected!==undefined&&(!revision(expected)||expected>=Number.MAX_SAFE_INTEGER))throw new DealerClientError('bad_request',0);
}
export function createDealerBannerApiClient(baseURL:string,tokenProvider:TokenProvider){
 const client=createApiClient(baseURL,tokenProvider);
 return {
 async get(id:string,signal?:AbortSignal):Promise<DealerBannerState>{
 scope(id);return state(await request(()=>client.GET(base,{params:{path:{id}},signal})),id);
 },
 async upload(id:string,source:Uint8Array,key:string,expectedRevision:number,signal?:AbortSignal):Promise<DealerBannerUpload>{
 scope(id,expectedRevision);
 if(!/^[\x21-\x7e]{16,128}$/.test(key))throw new DealerClientError('bad_request',0);
 if(!source.byteLength)throw new DealerClientError('invalid_photo',0);
 if(source.byteLength>limit)throw new DealerClientError('photo_limit_exceeded',0);
 const bytes=new Uint8Array(source).buffer;
 const result=await request(()=>client.POST(base,{params:{path:{id},header:{'Idempotency-Key':key},query:{expectedRevision}},body:'',bodySerializer:()=>bytes,headers:{'Content-Type':'application/octet-stream'},signal}));
 const current=state(result,id);
 if(!object(result.data)||!object(result.data.meta)||!exact(result.data.meta,['bannerID','replay'])||!validID(result.data.meta.bannerID)||typeof result.data.meta.replay!=='boolean')throw invalid();
 const {bannerID,replay}=result.data.meta;
 if(current.profile.revision<expectedRevision||!replay&&(current.profile.revision!==expectedRevision+1||current.banner?.id!==bannerID))throw invalid();
 return {...current,bannerID,replay};
 },
 async remove(id:string,expectedRevision:number,signal?:AbortSignal):Promise<DealerBannerState>{
 scope(id,expectedRevision);const current=state(await request(()=>client.DELETE(base,{params:{path:{id},query:{expectedRevision}},signal})),id);
 if(current.banner!==null||current.profile.revision!==expectedRevision+1)throw invalid();return current;
 },
 async image(id:string,bannerID:string,signal?:AbortSignal):Promise<Uint8Array>{
 scope(id);if(!validID(bannerID))throw new DealerClientError('bad_request',0);
 const result=await request(()=>client.GET('/v1/dealers/{id}/banner/{bannerID}/image',{params:{path:{id,bannerID}},parseAs:'arrayBuffer',signal}));
 if(!(result.data instanceof ArrayBuffer)||result.data.byteLength<4||result.data.byteLength>limit||result.response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='image/jpeg')throw invalid();
 const bytes=new Uint8Array(result.data);if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw invalid();return bytes;
 },
 };
}
