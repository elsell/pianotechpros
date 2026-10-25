import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {InquiryClientError,type InboxInquiry} from '@pianotechpros/api-client';
import {createInquiryWorkspace} from '@pianotechpros/client-core';
import {useInquiryRequest} from './use-inquiry-request';
export function useInquiryWorkspace(accountID:string,dealerID:string,id?:string){
 const request=useInquiryRequest();const [workspace]=useState(()=>createInquiryWorkspace<InboxInquiry>(error=>error instanceof InquiryClientError?error.code:'unavailable'));const [state,setState]=useState(workspace.snapshot());
 useEffect(()=>workspace.subscribe(setState),[workspace]);
 useFocusEffect(useCallback(()=>{workspace.replaceScope(accountID,dealerID,{list:(cursor,signal)=>request(api=>api.list(dealerID,cursor,30,signal)),get:(key,signal)=>request(api=>api.get(dealerID,key,signal)),markRead:(key,revision,signal)=>request(api=>api.markRead(dealerID,key,revision,signal))});if(id)void workspace.select(id);else void workspace.refresh();return()=>workspace.clear();},[workspace,accountID,dealerID,id,request]));
 return {workspace,state};
}
