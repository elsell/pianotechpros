import {createApiClient} from './client';
import type {TokenProvider} from './transport';
import type {components} from './schema';
import {object,key,revision,copyAttributes,validAttributes,validProfile,validTimezones,type TechnicianProfile,type TechnicianProfileAttributes} from './technician-profile-contract';
export type {TechnicianProfile,TechnicianProfileAttributes,TechnicianProfileOrigin,TechnicianWeeklyRule} from './technician-profile-contract';
export type TechnicianProfileErrorCode=components['schemas']['APIError']['code']|'network'|'protocol_error';
const codes=new Set<string>(['bad_request','unauthenticated','invalid_credential','forbidden','not_found','conflict','idempotency_conflict','validation_failed','rate_limited','authorization_pending','authorization_dead_lettered','authorization_policy_not_configured','unavailable','internal_error','request_failed'] satisfies components['schemas']['APIError']['code'][]);
/** Machine data only; personal fields and raw transport causes never escape. */
export class TechnicianProfileClientError extends Error {
 constructor(readonly code:TechnicianProfileErrorCode,readonly status:number){super(code);this.name='TechnicianProfileClientError';}
}
const invalid=()=>new TechnicianProfileClientError('validation_failed',0);
export function createTechnicianProfileApiClient(baseURL:string,tokenProvider:TokenProvider){
 const client=createApiClient(baseURL,tokenProvider);
 async function request(operation:()=>Promise<{response:Response;data?:unknown;error?:unknown}>):Promise<{data:unknown;status:number}>{
  let result;try{result=await operation();}catch(error){throw new TechnicianProfileClientError(error instanceof SyntaxError?'protocol_error':'network',0);}
  if(!result.response.ok){const code=object(result.error)?result.error.code:undefined;throw new TechnicianProfileClientError(typeof code==='string'&&codes.has(code)?code as TechnicianProfileErrorCode:'protocol_error',result.response.status);}
  if(!object(result.data)||!('data' in result.data))throw new TechnicianProfileClientError('protocol_error',result.response.status);
  return {data:result.data.data,status:result.response.status};
 }
 async function profile(operation:Parameters<typeof request>[0],expected?:{id:string;revision:number}):Promise<TechnicianProfile>{
  const result=await request(operation);const value=result.data;
  if(!validProfile(value)||expected&&(value.id!==expected.id||(value.revision!==expected.revision&&value.revision!==expected.revision+1)))throw new TechnicianProfileClientError('protocol_error',result.status);
  return {...value,attributes:copyAttributes(value.attributes)};
 }
 return {
  get:(signal?:AbortSignal)=>profile(()=>client.GET('/v1/technician-profile',{signal})),
  async create(attributes:TechnicianProfileAttributes,idempotencyKey:string,signal?:AbortSignal):Promise<TechnicianProfile>{
   if(!validAttributes(attributes)||typeof idempotencyKey!=='string'||!/^[\x21-\x7e]{16,128}$/.test(idempotencyKey))throw invalid();
   const snapshot=copyAttributes(attributes);
   return profile(()=>client.POST('/v1/technician-profile',{body:{attributes:snapshot},params:{header:{'Idempotency-Key':idempotencyKey}},signal}));
  },
  async save(id:string,attributes:TechnicianProfileAttributes,expectedRevision:number,signal?:AbortSignal):Promise<TechnicianProfile>{
   if(!key(id)||!revision(expectedRevision)||!validAttributes(attributes))throw invalid();
   const snapshot=copyAttributes(attributes);
   return profile(()=>client.PUT('/v1/technician-profile',{body:{expectedRevision,attributes:snapshot},signal}),{id,revision:expectedRevision});
  },
  async timezones(signal?:AbortSignal):Promise<string[]>{
   const result=await request(()=>client.GET('/v1/technician-profile/timezones',{signal}));
   if(!validTimezones(result.data))throw new TechnicianProfileClientError('protocol_error',result.status);
   return [...result.data.names];
  },
 };
}
