import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {randomUUID} from 'expo-crypto';
import {TechnicianProfileClientError} from '@pianotechpros/api-client';
import {openTechnicianWorkspace,TechnicianWorkspaceError,emptyTechnicianForm,type TechnicianEditorState,type TechnicianWorkspace} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useTechnicianRequest} from '../use-technician-request';
import {mobileTechnicianOwnership} from './ownership';
import {openMobileTechnicianRecovery} from './recovery-storage';
import {mobileTechnicianPresentation} from './presentation';

export function useTechnicianWorkspace(accountId:string,apiURL:string){
 const auth=useMobileSession(),request=useTechnicianRequest();
 const current=useRef<typeof auth|null>(auth);
 useLayoutEffect(()=>{current.current=auth;return()=>{current.current=null;};},[auth]);
 const lifetime=mobileTechnicianPresentation;
 const [attempt,retry]=useState(0);
 const [workspace,setWorkspace]=useState<TechnicianWorkspace|null>(null);
 const [state,setState]=useState<TechnicianEditorState|null>(null);
 const [failure,setFailure]=useState<MessageKey|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let mounted=true;let unsubscribe=()=>{};
  setWorkspace(null);setState(null);setFailure(null);setLoading(true);
  const stop=lifetime.start({
   open:active=>openTechnicianWorkspace({scope:{userID:accountId,apiBaseURL:apiURL},ownership:mobileTechnicianOwnership,now:Date.now,key:randomUUID,draft:emptyTechnicianForm(),
    active:()=>active()&&current.current?.profile?.id===accountId&&current.current.apiURL===apiURL&&!!current.current.session&&Date.parse(current.current.session.expiresAt)>Date.now(),
    storage:()=>openMobileTechnicianRecovery(accountId),
    isMissing:error=>error instanceof TechnicianProfileClientError&&error.code==='not_found',
    classify:error=>error instanceof TechnicianProfileClientError&&[401,403,404].includes(error.status)?'denied':error instanceof TechnicianProfileClientError&&error.code==='conflict'?'conflict':error instanceof TechnicianProfileClientError&&([400,422].includes(error.status)||error.code==='idempotency_conflict')?'rejected':'uncertain',
    api:{get:()=>request(api=>api.get()),timezones:()=>request(api=>api.timezones()),create:(a,key)=>request(api=>api.create(a,key)),save:(id,a,revision)=>request(api=>api.save(id,a,revision))},
   }),
   ready:next=>{setWorkspace(next);setLoading(false);unsubscribe=next.editor.subscribe(value=>{if(mounted){setState(value);if(!value)setFailure('technician.access');}});},
   failed:error=>{setLoading(false);setFailure(error instanceof TechnicianWorkspaceError&&error.reason==='busy'?'technician.busy':error instanceof TechnicianWorkspaceError&&error.reason==='access'?'technician.access':error instanceof TechnicianWorkspaceError&&error.reason==='unavailable'?'technician.unavailable':'technician.storage');},
  });
  return()=>{mounted=false;unsubscribe();stop();};
 },[accountId,apiURL,request,lifetime,attempt]);
 return {workspace,state,failure,loading,retry:()=>retry(value=>value+1)};
}
