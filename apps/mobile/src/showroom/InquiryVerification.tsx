import {useEffect,useRef,useState} from 'react';
import {AppState,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';
import {createInquiryProof,inquiryVerificationNavigation,inquiryProofCallbacks} from '@pianotechpros/client-core';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {NativeButton} from '../native-button';
export type InquiryProof=ReturnType<typeof createInquiryProof>;
export function InquiryVerification({url,proof,changed}:{url:string;proof:InquiryProof;changed():void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const [generation,setGeneration]=useState(0),[active,setActive]=useState(AppState.currentState==='active'),[failed,setFailed]=useState(false);
 const changedRef=useRef(changed);changedRef.current=changed;
 const [instance,setInstance]=useState<object>({});
 useEffect(()=>{setInstance(proof.restart());changedRef.current();const subscription=AppState.addEventListener('change',state=>{proof.clear();changedRef.current();setActive(state==='active');if(state==='active'){setInstance(proof.restart());setGeneration(old=>old+1);setFailed(false);}});return()=>{subscription.remove();proof.clear();};},[proof]);
 const callbacks=inquiryProofCallbacks(proof,instance,()=>changedRef.current(),()=>setFailed(true));
 const fail=callbacks.fail;
 function retry(){setInstance(proof.restart());changedRef.current();setFailed(false);setGeneration(old=>old+1);}
 return <View style={{gap:12}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:18}}>{i18n.t('inquiry.verification')}</Text>
 {active&&!failed?<WebView key={generation} source={{uri:url,headers:{'Accept-Language':i18n.locale}}} style={{height:230,backgroundColor:theme.background}} javaScriptEnabled domStorageEnabled
  originWhitelist={['*']} onShouldStartLoadWithRequest={request=>inquiryVerificationNavigation(url,request.url,request.isTopFrame)}
  onNavigationStateChange={state=>{if(state.url!==url)fail();}}
  onMessage={event=>callbacks.message(event.nativeEvent.url,event.nativeEvent.data)}
  onError={fail} onHttpError={fail} onContentProcessDidTerminate={fail} onRenderProcessGone={fail}
  allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} sharedCookiesEnabled={false} geolocationEnabled={false}
  javaScriptCanOpenWindowsAutomatically={false} onOpenWindow={fail} mixedContentMode="never" allowsLinkPreview={false} allowsBackForwardNavigationGestures={false} cacheEnabled={false} webviewDebuggingEnabled={false}
 />:null}
 {failed?<><Text accessibilityRole="alert" style={{color:theme.text,fontSize:17}}>{i18n.t('inquiry.verificationFailed')}</Text><NativeButton title={i18n.t('inquiry.verificationRetry')} onPress={retry}/></>:null}
 </View>;
}
