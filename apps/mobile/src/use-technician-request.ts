import {createTechnicianProfileApiClient,TechnicianProfileClientError,sessionScopedFailure} from '@pianotechpros/api-client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useMobileSession} from './session-provider';

/** Only rejection of the committed current credential can clear the session. */
export function useTechnicianRequest(){
 const context=useMobileSession();const current=useRef<typeof context|null>(context);
 useLayoutEffect(()=>{current.current=context;return()=>{current.current=null;};},[context]);
 const [request]=useState(()=>async<T,>(operation:(api:ReturnType<typeof createTechnicianProfileApiClient>)=>Promise<T>):Promise<T>=>{
  const scope=current.current;const credential=scope?.session;
  if(!scope||!credential||Date.parse(credential.expiresAt)<=Date.now())throw new TechnicianProfileClientError('unauthenticated',401);
  try{return await operation(createTechnicianProfileApiClient(scope.apiURL,()=>credential.token));}
  catch(error){
   error=sessionScopedFailure(error,credential.token,current.current?.session?.token??null);
   if(error instanceof TechnicianProfileClientError&&error.status===401&&current.current?.session?.token===credential.token)current.current.reject(credential.token);
   throw error;
  }
 });
 return request;
}
