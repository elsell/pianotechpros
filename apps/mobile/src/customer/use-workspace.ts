import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import {CustomerProfileClientError} from '@pianotechpros/api-client';
import {openCustomerWorkspace,CustomerWorkspaceError,emptyCustomerForm,type CustomerEditorState,type CustomerWorkspace} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useCustomerRequest} from '../use-customer-request';
import {mobileCustomerOwnership} from './ownership';
import {openMobileCustomerRecovery} from './recovery-storage';
import {mobileCustomerPresentation} from './presentation';

export function useCustomerWorkspace(accountId:string,apiURL:string){
 const auth=useMobileSession(),request=useCustomerRequest();
 const current=useRef<typeof auth|null>(auth);
 useLayoutEffect(()=>{current.current=auth;return()=>{current.current=null;};},[auth]);
 const lifetime=mobileCustomerPresentation;
 const [attempt,retry]=useState(0);
 const [workspace,setWorkspace]=useState<CustomerWorkspace|null>(null);
 const [state,setState]=useState<CustomerEditorState|null>(null);
 const [failure,setFailure]=useState<MessageKey|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let mounted=true;let unsubscribe=()=>{};
  setWorkspace(null);setState(null);setFailure(null);setLoading(true);
  const stop=lifetime.start({
   open:active=>openCustomerWorkspace({scope:{userID:accountId,apiBaseURL:apiURL},ownership:mobileCustomerOwnership,now:Date.now,key:randomUUID,draft:emptyCustomerForm(),
    active:()=>active()&&current.current?.profile?.id===accountId&&current.current.apiURL===apiURL&&!!current.current.session&&Date.parse(current.current.session.expiresAt)>Date.now(),
    storage:()=>openMobileCustomerRecovery(accountId),
    isMissing:error=>error instanceof CustomerProfileClientError&&error.code==='not_found',
    classify:error=>error instanceof CustomerProfileClientError&&[401,403,404].includes(error.status)?'denied':error instanceof CustomerProfileClientError&&error.code==='conflict'?'conflict':error instanceof CustomerProfileClientError&&([400,422].includes(error.status)||error.code==='idempotency_conflict')?'rejected':'uncertain',
    api:{get:()=>request(api=>api.get()),timezones:()=>request(api=>api.timezones()),create:(a,key)=>request(api=>api.create(a,key)),save:(id,a,revision)=>request(api=>api.save(id,a,revision))},
   }),
   ready:next=>{setWorkspace(next);setLoading(false);unsubscribe=next.editor.subscribe(value=>{if(mounted){setState(value);if(!value)setFailure('customer.access');}});},
   failed:error=>{setLoading(false);setFailure(error instanceof CustomerWorkspaceError&&error.reason==='busy'?'customer.busy':error instanceof CustomerWorkspaceError&&error.reason==='access'?'customer.access':error instanceof CustomerWorkspaceError&&error.reason==='unavailable'?'customer.unavailable':'customer.storage');},
  });
  return()=>{mounted=false;unsubscribe();stop();};
 },[accountId,apiURL,request,lifetime,attempt]);
 return {workspace,state,failure,loading,retry:()=>retry(value=>value+1)};
}
