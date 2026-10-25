import {useLayoutEffect,useRef,useState} from 'react';
import {createInquiryInboxApiClient,InquiryClientError} from '@pianotechpros/api-client';
import {useMobileSession} from './session-provider';
/** Requests use committed credentials; only an explicit rejection invalidates the session. */
export function useInquiryRequest(){
 const context=useMobileSession();const current=useRef<typeof context|null>(context);
 useLayoutEffect(()=>{current.current=context;return()=>{current.current=null;};},[context]);
 const [request]=useState(()=>async<T,>(operation:(api:ReturnType<typeof createInquiryInboxApiClient>)=>Promise<T>):Promise<T>=>{
  const scope=current.current;const credential=scope?.session;
  if(!scope||!credential||Date.parse(credential.expiresAt)<=Date.now())throw new InquiryClientError('unauthenticated',401);
  try{return await operation(createInquiryInboxApiClient(scope.apiURL,()=>credential.token));}
  catch(error){if(error instanceof InquiryClientError&&error.status===401&&current.current?.session?.token===credential.token)current.current.reject(credential.token);throw error;}
 });return request;
}
