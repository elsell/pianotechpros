import createClient from 'openapi-fetch';
import type {components,paths,operations} from './schema';
import {validPublicListing} from './inventory-publication';

export type PublicShowroomProfile=components['schemas']['PublicShowroomProfile'];
export type PublicPiano=components['schemas']['PublicListing'];
export type ShowroomFilters=NonNullable<operations['list-public-pianos']['parameters']['query']>;
export type ShowroomPage={profile:PublicShowroomProfile;pianos:PublicPiano[];nextCursor?:string};
export class ShowroomClientError extends Error {
 constructor(readonly code:'not_found'|'invalid_query'|'rate_limited'|'unavailable'|'network'|'protocol_error',readonly status:number){super(code);this.name='ShowroomClientError';}
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string)=>Object.keys(v).sort().join(' ')===keys.split(' ').sort().join(' ');
const text=(v:unknown,max:number,required=false):v is string=>typeof v==='string'&&v.trim()===v&&[...v].length<=max&&!/\p{Surrogate}/u.test(v)&&(!required||!!v);
const identifier=(v:unknown,max=128):v is string=>text(v,max,true)&&!/[\u0000-\u001f\u007f]/u.test(v)&&!/[/?#\\]/u.test(v);
function validProfile(v:unknown,slug:string):v is PublicShowroomProfile{
 if(!object(v)||!exact(v,'id name slug email phone website_url tagline description street_address_1 street_address_2 city region postal_code appointment_note delivery_note warranty_note service_note banner_alt_text accent_color')||!identifier(v.id)||v.slug!==slug||!text(v.name,200,true))return false;
 const bounds:Record<string,number>={id:128,name:200,slug:80,email:320,phone:32,website_url:2048,tagline:240,description:4000,street_address_1:200,street_address_2:200,city:100,region:64,postal_code:20,appointment_note:2000,delivery_note:2000,warranty_note:2000,service_note:2000,banner_alt_text:240,accent_color:7};
 for(const [key,value] of Object.entries(v))if(!text(value,bounds[key]!))return false;
 // The API validates RFC mailbox syntax. Presentation validates a bounded single
 // recipient and URI-encodes it; it must not invent narrower email rules.
 if(!text(v.email,320,true)||!v.email.includes('@')||/[\u0000-\u001f\u007f<>]/u.test(v.email))return false;
 if(typeof v.accent_color!=='string'||!/^#[0-9a-f]{6}$/i.test(v.accent_color))return false;
 if(v.website_url){try{const url=new URL(String(v.website_url));if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return false;}catch{return false;}}
 return true;
}
type Wire={response:Response;data?:unknown;error?:unknown};
export function createShowroomApiClient(baseURL:string){
 const client=createClient<paths>({baseUrl:baseURL,fetch:async(input)=>{
  const headers=new Headers(input.headers);headers.delete('Authorization');headers.delete('Cookie');
  return fetch(input,{headers,credentials:'omit',cache:'no-store',redirect:'error'});
 }});
 async function execute(run:()=>Promise<Wire>):Promise<Wire>{
  let result:Wire;try{result=await run();}catch(e){throw new ShowroomClientError(e instanceof SyntaxError?'protocol_error':'network',0);}
  if(!result.response.ok){const status=result.response.status;throw new ShowroomClientError(status===404?'not_found':status===400||status===422?'invalid_query':status===429?'rate_limited':'unavailable',status);}
  return result;
 }
 const invalid=()=>new ShowroomClientError('protocol_error',200);
 const scope=(slug:string,id?:string)=>{if(!identifier(slug,80)||id!==undefined&&!identifier(id))throw new ShowroomClientError('invalid_query',0);};
 return {
  async list(slug:string,filters:ShowroomFilters={},signal?:AbortSignal):Promise<ShowroomPage>{
   scope(slug);const query={...filters};const result=await execute(()=>client.GET('/v1/showrooms/{slug}/pianos',{params:{path:{slug},query},signal}));const body=result.data;
   if(!object(body)||!object(body.data)||!exact(body.data,'profile pianos')||!validProfile(body.data.profile,slug)||!Array.isArray(body.data.pianos)||body.data.pianos.length>(query.limit??30)||!object(body.meta)||Object.keys(body.meta).some(k=>k!=='nextCursor'))throw invalid();
   const ids=new Set<string>();for(const p of body.data.pianos){if(!object(p)||!identifier(p.id)||ids.has(p.id)||!validPublicListing(p,body.data.profile.id,p.id)||!['available','reserved','sold'].includes(p.status))throw invalid();ids.add(p.id);}
   const next=body.meta.nextCursor;if(next!==undefined&&(!text(next,4096,true)||!body.data.pianos.length))throw invalid();
   return {profile:body.data.profile,pianos:body.data.pianos as PublicPiano[],nextCursor:next as string|undefined};
  },
  async listing(slug:string,id:string,signal?:AbortSignal):Promise<{profile:PublicShowroomProfile;piano:PublicPiano}>{
   scope(slug,id);const result=await execute(()=>client.GET('/v1/showrooms/{slug}/pianos/{id}',{params:{path:{slug,id}},signal}));const body=result.data;
   if(!object(body)||!object(body.data)||!exact(body.data,'profile piano')||!validProfile(body.data.profile,slug)||!validPublicListing(body.data.piano,body.data.profile.id,id)||!['available','reserved','sold'].includes(body.data.piano.status))throw invalid();
   return {profile:body.data.profile,piano:body.data.piano};
  },
  async photo(slug:string,id:string,photoID:string,signal?:AbortSignal):Promise<ArrayBuffer>{
   scope(slug,id);if(!identifier(photoID))throw new ShowroomClientError('invalid_query',0);
   const result=await execute(()=>client.GET('/v1/showrooms/{slug}/pianos/{id}/photos/{photoID}',{params:{path:{slug,id,photoID}},parseAs:'arrayBuffer',signal}));
   if(!(result.data instanceof ArrayBuffer)||result.data.byteLength<4||result.data.byteLength>20*1024*1024||result.response.headers.get('content-type')?.split(';')[0]!=='image/jpeg')throw invalid();
   const bytes=new Uint8Array(result.data);if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw invalid();return result.data;
  },
 };
}
