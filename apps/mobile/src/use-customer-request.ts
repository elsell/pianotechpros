import {createCustomerProfileApiClient,CustomerProfileClientError,sessionScopedFailure} from '@pianotechpros/api-client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useMobileSession} from './session-provider';

/** Only rejection of the committed current credential can clear the session. */
export function useCustomerRequest(){
 const context=useMobileSession();const current=useRef<typeof context|null>(context);
 useLayoutEffect(()=>{current.current=context;return()=>{current.current=null;};},[context]);
 const [request]=useState(()=>async<T,>(operation:(api:ReturnType<typeof createCustomerProfileApiClient>)=>Promise<T>):Promise<T>=>{
  const scope=current.current;const credential=scope?.session;
  if(!scope||!credential||Date.parse(credential.expiresAt)<=Date.now())throw new CustomerProfileClientError('unauthenticated',401);
  try{return await operation(createCustomerProfileApiClient(scope.apiURL,()=>credential.token));}
  catch(error){
   error=sessionScopedFailure(error,credential.token,current.current?.session?.token??null);
   if(error instanceof CustomerProfileClientError&&error.status===401&&current.current?.session?.token===credential.token)current.current.reject(credential.token);
   throw error;
  }
 });
 return request;
}
