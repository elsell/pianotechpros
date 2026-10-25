import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Button,Image,Modal,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {Redirect,Stack,useLocalSearchParams} from 'expo-router';
import {useIsFocused} from '@react-navigation/native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {randomUUID} from 'expo-crypto';
import {DealerClientError,type DealerProfile} from '@pianotechpros/api-client';
import {createDealerBanner,createNativeBannerPicker,photoPreviewURI,type BannerEditorState} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {useDealerBannerRequest} from '../../src/use-dealer-request';
import {openMobileInventoryRecovery} from '../../src/inventory/recovery-storage';
import {claimMobilePhotoPicker,discardMobilePhoto,launchMobilePhoto,mobilePickerOwner,pendingMobilePhoto,prepareMobilePhoto} from '../../src/inventory/photo-media';

type Editor=ReturnType<typeof createDealerBanner<DealerProfile>>;
type Picker=ReturnType<typeof createNativeBannerPicker>;
const denied=(error:unknown)=>error instanceof DealerClientError&&[401,403,404].includes(error.status);
function CurrentImage({id,alt,read}:{id:string;alt:string;read:(id:string,signal:AbortSignal)=>Promise<Uint8Array>}){
 const {i18n}=useMobileSession(),theme=useNativeTheme();
 const [uri,setURI]=useState<string|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;const abort=new AbortController();setURI(null);setFailed(false);
  void read(id,abort.signal).then(bytes=>{if(active)setURI(photoPreviewURI(bytes));}).catch(()=>{if(active)setFailed(true);});
  return()=>{active=false;abort.abort();};
 },[id,read]);
 return uri?<Image source={{uri}} accessible accessibilityLabel={alt} resizeMode="contain" style={{width:'100%',height:220}} onError={()=>{setURI(null);setFailed(true);}} />:<Text style={{color:theme.secondary,padding:20}}>{i18n.t(failed?'inventory.photos.imageFailed':'common.loading')}</Text>;
}
function BannerScreen({dealerID,userID}:{dealerID:string;userID:string}){
 const {i18n}=useMobileSession(),theme=useNativeTheme(),request=useDealerBannerRequest(),focused=useIsFocused();
 const dimensions=useWindowDimensions();
 const model=useRef<{editor:Editor;picker:Picker;active():boolean}|null>(null);
 const [state,setState]=useState<BannerEditorState<DealerProfile>|null>(null);
 const [picker,setPicker]=useState<ReturnType<Picker['snapshot']>|null>(null);
 const [preview,setPreview]=useState<string|null>(null);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 useEffect(()=>{
  if(!focused)return;
  let alive=true;
  const active=()=>alive;
  const editor=createDealerBanner<DealerProfile>({
   dealerID,initial:null,key:randomUUID,
   load:signal=>request(api=>api.get(dealerID,signal)),
   upload:(bytes,key,revision,signal)=>request(api=>api.upload(dealerID,bytes,key,revision,signal)),
   remove:(revision,signal)=>request(api=>api.remove(dealerID,revision,signal)),
   denied,conflict:error=>error instanceof DealerClientError&&['conflict','idempotency_conflict'].includes(error.code),
   rejected:error=>error instanceof DealerClientError&&['invalid_photo','photo_limit_exceeded','bad_request','validation_failed'].includes(error.code),
  });
  const selection=createNativeBannerPicker({
   userID,dealerID,editor,active,now:Date.now,key:randomUUID,
   owner:mobilePickerOwner,lease:claimMobilePhotoPicker,storage:()=>openMobileInventoryRecovery(userID),
   authorize:async()=>{await request(api=>api.get(dealerID));},
   pending:pendingMobilePhoto,launch:source=>launchMobilePhoto(source,active),discard:discardMobilePhoto,
   prepare:asset=>prepareMobilePhoto(asset,active),
   selected:bytes=>{if(active())setPreview(photoPreviewURI(bytes));},
  });
  const current={editor,picker:selection,active};model.current=current;
  const unedit=editor.subscribe(next=>{if(alive){setState(next);if(!next.hasSelection)setPreview(null);}});
  const unpick=selection.subscribe(next=>{if(alive)setPicker(next);});
  void (async()=>{await editor.refresh();if(active()&&!editor.snapshot().denied)await selection.restore();})();
  const lifecycle=AppState.addEventListener('change',value=>{if(alive){setForeground(value==='active');if(value!=='active')editor.interrupt();}});
  return()=>{alive=false;unedit();unpick();lifecycle.remove();editor.dispose();void selection.dispose();setState(null);setPreview(null);setPicker(null);if(model.current===current)model.current=null;};
 },[dealerID,userID,request,focused]);
 const readImage=useCallback(async(id:string,signal:AbortSignal)=>{
  try{return await request(api=>api.image(dealerID,id,signal));}
  catch(error){if(denied(error)&&model.current?.active())void model.current.editor.refresh();throw error;}
 },[dealerID,request]);
 const current=state?.current,phase=state?.phase,busy=!!state?.busy||!!picker?.busy;
 const review=phase==='upload-review'||phase==='upload-uncertain'||phase==='remove-review';
 const t=(key:string)=>i18n.t(('dealer.banner.'+key) as MessageKey);
 const text={color:theme.text,fontSize:17},secondary={color:theme.secondary,fontSize:16};
 const cancel=()=>{if(!busy)model.current?.editor.cancel();};
 async function choose(){
  const current=model.current;if(!current||busy||picker?.held||state?.phase!=='idle')return;
  await current.picker.select('library');
  if(current.active()&&current.picker.snapshot().state.status==='selected'&&!current.picker.snapshot().error)await current.picker.consume();
 }
 return <><Stack.Screen options={{title:t('heading')}} />
 <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20,paddingBottom:48,gap:16}}>
  <Text accessibilityRole="header" style={{...text,fontSize:26,fontWeight:'600'}}>{current?.profile.name??t('heading')}</Text>
  <Text style={secondary}>{t('intro')}</Text>
  {current?<><View style={{backgroundColor:theme.surface,borderRadius:16,padding:16,borderWidth:1,borderColor:theme.border}}>
   {current.banner?<CurrentImage key={current.banner.id} id={current.banner.id} read={readImage} alt={current.profile.banner_alt_text||t('current')} />:<Text style={secondary}>{t('empty')}</Text>}
  </View><Text style={secondary}>{t('formats')}</Text><Text style={secondary}>{t('altHint')}</Text>
   <Button title={t('choose')} color={theme.accent} disabled={busy||!!picker?.held||phase!=='idle'} onPress={()=>{void choose();}} />
   {current.banner?<Button title={t('remove')} color={theme.accent} disabled={busy||!!picker?.held||phase!=='idle'} onPress={()=>model.current?.editor.reviewRemoval()} />:null}
  </>:null}
  {busy?<Text accessibilityLiveRegion="polite" style={secondary}>{i18n.t(state?.busy&&phase!=='idle'?'dealer.banner.busy':'common.loading')}</Text>:null}
  {state?.denied?<Text accessibilityRole="alert" style={text}>{t('denied')}</Text>:phase==='refresh-required'?<Text accessibilityRole="alert" style={text}>{t('refreshRequired')}</Text>:state?.failure&&!review?<Text accessibilityRole="alert" style={text}>{t('failed')}</Text>:null}
  {state?.notice?<Text accessibilityLiveRegion="polite" style={text}>{t(state.notice)}</Text>:null}
  {picker?.error?<Text accessibilityRole="alert" style={text}>{t(picker.error==='other_target'?'pickerOther':'failed')}</Text>:null}
  {picker?.state.status==='denied'?<Text accessibilityRole="alert" style={text}>{t('pickerDenied')}</Text>:null}
  {picker?.held?<View style={{gap:12,padding:16,borderWidth:1,borderColor:theme.border,borderRadius:12}}>
   <Text style={text}>{t(picker.state.status==='selected'?'pickerSelected':picker.state.status==='uncertain'?'pickerUncertain':'pickerInterrupted')}</Text>
   {picker.state.status==='selected'?<Button title={t('pickerContinue')} color={theme.accent} disabled={busy} onPress={()=>{void model.current?.picker.consume();}} />:<Button title={t('pickerResume')} color={theme.accent} disabled={busy} onPress={()=>{void model.current?.picker.restore();}} />}
   <Button title={t('pickerDiscard')} color={theme.accent} disabled={busy} onPress={()=>{void model.current?.picker.discard();}} />
  </View>:null}
  {!review?<Button title={t('refresh')} color={theme.accent} disabled={busy||!!picker?.held} onPress={()=>{void model.current?.editor.refresh();}} />:null}
 </ScrollView>
 <Modal visible={!!review&&focused&&foreground} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
  <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:theme.background}} accessibilityViewIsModal onAccessibilityEscape={cancel}>
   <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:20}}>
    <Text accessibilityRole="header" style={{...text,fontSize:24,fontWeight:'600'}}>{t(phase==='remove-review'?'removeReview':'review')}</Text>
    {phase==='remove-review'?<Text style={text}>{t('removeHint')}</Text>:preview?<Image source={{uri:preview}} resizeMode="contain" accessible accessibilityLabel={t('preview')} style={{width:'100%',height:Math.min(dimensions.height*.4,360)}} />:null}
    <Text style={secondary}>{t('immediate')}</Text>
    {phase==='upload-uncertain'?<Text accessibilityRole="alert" style={text}>{t('uncertain')}</Text>:state?.failure?<Text accessibilityRole="alert" style={text}>{t('failed')}</Text>:null}
    {busy?<Text accessibilityLiveRegion="polite" style={secondary}>{t('busy')}</Text>:null}
    <Button title={t('cancel')} color={theme.accent} disabled={busy} onPress={cancel} />
    <Button title={t(phase==='remove-review'?'confirmRemove':phase==='upload-uncertain'?'retry':'confirm')} color={phase==='remove-review'?(theme.statusBarStyle==='light'?'#ff8a80':'#b42318'):theme.accent} disabled={busy||(phase!=='remove-review'&&!preview)} onPress={()=>{const editor=model.current?.editor;if(editor)void (phase==='remove-review'?editor.confirmRemoval():editor.confirmUpload());}} />
   </ScrollView>
  </SafeAreaView></SafeAreaProvider>
 </Modal></>;
}
export default function DealerBannerScreen(){
 const {id}=useLocalSearchParams<{id:string}>(),auth=useMobileSession(),theme=useNativeTheme();
 if(!auth.ready)return <View style={{flex:1,padding:20,backgroundColor:theme.background}}><Text style={{color:theme.text}}>{auth.i18n.t('common.loading')}</Text></View>;
 if(!auth.session||!auth.profile||typeof id!=='string')return <Redirect href="/" />;
 return <BannerScreen key={JSON.stringify([auth.profile.id,id])} userID={auth.profile.id} dealerID={id} />;
}
