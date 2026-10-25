import {NativeButton as Button} from '../native-button';
import {useLayoutEffect,useRef,useState} from 'react';
import {AppState,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {resolvePublicListingLink,sharePublicLink} from '@pianotechpros/client-core';
import {useMobileSession} from '../session-provider';
import {useDealerRequest} from '../use-dealer-request';
import {nativePublicSharing} from '../public-share';
import {useNativeTheme} from '../native-theme';
export function InventoryPublicShare({dealerID,recordID,disabled}:{dealerID:string;recordID:string;disabled:boolean}){
 const {i18n,apiURL,webURL,profile}=useMobileSession(),request=useDealerRequest(),theme=useNativeTheme(),focused=useIsFocused();
 const scope=useRef<{active:boolean;pending:AbortController|null}|null>(null);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useLayoutEffect(()=>{
  const current={active:focused,pending:null as AbortController|null};scope.current=current;setBusy(false);setFailed(false);
  const lifecycle=AppState.addEventListener('change',state=>{if(state!=='active'){current.pending?.abort();current.pending=null;setBusy(false);}});
  return()=>{current.active=false;current.pending?.abort();lifecycle.remove();if(scope.current===current)scope.current=null;};
 },[dealerID,recordID,profile?.id,focused,request]);
 async function share(){
  const current=scope.current;if(!current?.active||current.pending||disabled)return;
  const abort=new AbortController();current.pending=abort;setBusy(true);setFailed(false);
  try{
   const link=await resolvePublicListingLink({origin:webURL,dealerID,recordID},{profile:()=>request(api=>api.get(dealerID)),listing:(slug,id,signal)=>createShowroomApiClient(apiURL).listing(slug,id,signal)},abort.signal);
   if(!current.active||abort.signal.aborted)return;
   await sharePublicLink(link,nativePublicSharing);
  }catch{if(current.active&&!abort.signal.aborted)setFailed(true);}
  finally{if(scope.current===current&&current.pending===abort){current.pending=null;setBusy(false);}}
 }
 return <View style={{gap:8}}><Button title={i18n.t('showroom.sharing.share')}  disabled={disabled||busy||!focused} onPress={()=>void share()} />
 {busy?<Text accessibilityLiveRegion="polite" style={{color:theme.secondary}}>{i18n.t('common.loading')}</Text>:null}
 {failed?<Text accessibilityRole="alert" style={{color:theme.text}}>{i18n.t('showroom.sharing.unavailable')}</Text>:null}</View>;
}
