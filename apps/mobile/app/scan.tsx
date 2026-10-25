import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppState,BackHandler,Button,Keyboard,ScrollView,Text,TextInput,View} from 'react-native';
import {Stack,useFocusEffect,useRouter} from 'expo-router';
import {useIsFocused,usePreventRemove} from '@react-navigation/native';
import {NativeScanCamera,useNativeScanPermission} from '../src/inventory/scan-camera';
import {InventoryClientError,type InventoryPhoto,type InventoryRecord} from '@pianotechpros/api-client';
import {createInventoryScanCamera,createInventoryScanView,inventoryScanLabelTitle} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../src/session-provider';
import {useNativeTheme} from '../src/native-theme';
import {useInventoryScanRequest,useInventoryPhotoRequest} from '../src/use-inventory-request';
import {voicePermissionResume as waitPermissionForeground} from '../src/inventory/voice-permission-resume';
import {InventoryScanActions} from '../src/inventory/InventoryScanActions';
import {InventoryPhotoImage} from '../src/inventory/InventoryPhotos';
function ScanResult({busy,onBusy}:{busy:boolean;onBusy(value:boolean):void}){
 const {scanEntry,webURL,i18n,profile}=useMobileSession();const theme=useNativeTheme();const router=useRouter();const scans=useInventoryScanRequest();const photos=useInventoryPhotoRequest();
 const [model]=useState(()=>createInventoryScanView<InventoryRecord&{cover:InventoryPhoto|null}>({origin:webURL,resolve:(dealer,token,signal)=>scans(api=>api.resolve(dealer,token,signal)),read:(dealer,id,signal)=>photos(async api=>{const result=await api.list(dealer,id,signal);return {...result.record,cover:result.photos[0]??null};}),classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':'unavailable'}));
 const [state,setState]=useState(model.snapshot());
 useEffect(()=>{const unsubscribe=model.subscribe(setState);const link=scanEntry.link();if(link)void model.open(link);return()=>{unsubscribe();model.dispose();};},[model,scanEntry]);
 const [actionDenied,setActionDenied]=useState(false);const denialRechecked=useRef(false);
 function intent(){setActionDenied(false);denialRechecked.current=false;}
 function denied(){setActionDenied(true);if(!denialRechecked.current){denialRechecked.current=true;void model.retry();}}
 function observed(record:InventoryRecord){setState(previous=>previous.record&&record.id===previous.record.id&&record.dealer_id===previous.record.dealer_id&&record.revision>=previous.record.revision?{...previous,record:{...previous.record,...record}}:previous);}
 function refresh(){intent();void model.retry();}
 const record=state.record;const text={color:theme.text,fontSize:17};
 return <View style={{gap:16}}>
 {actionDenied&&record?<Text accessibilityRole="alert" style={text}>{i18n.t('scan.view.actionDenied')}</Text>:null}
 {state.busy?<Text accessibilityLiveRegion="polite" style={text}>{i18n.t('common.loading')}</Text>:null}
 {state.issue?<Text accessibilityRole="alert" style={text}>{i18n.t(state.issue==='invalid'?'scan.view.invalid':state.issue==='denied'?'inventory.denied':'scan.view.failed')}</Text>:null}
 {state.issue==='unavailable'?<Button title={i18n.t('inventory.retry')} color={theme.accent} onPress={()=>void model.retry()} />:null}
 {record?<><Text accessibilityRole="header" style={{...text,fontSize:28,fontWeight:'600'}}>{inventoryScanLabelTitle(record.attributes)}</Text><Text style={text}>{i18n.t('inventory.stock',{number:record.attributes.stock_number})}</Text><Text style={text}>{i18n.t(`inventory.status.${record.status}` as MessageKey)}</Text>
 {record.cover?<InventoryPhotoImage key={record.cover.id} dealerID={record.dealer_id} recordID={record.id} photoID={record.cover.id} alt={record.cover.altText||inventoryScanLabelTitle(record.attributes)} />:<Text style={{...text,color:theme.secondary}}>{i18n.t('inventory.photos.empty')}</Text>}
 <Text style={text}>{i18n.t('inventory.field.make')}: {record.attributes.make}</Text><Text style={text}>{i18n.t('inventory.field.model')}: {record.attributes.model}</Text>
 <Button title={i18n.t('scan.view.editor')} color={theme.accent} disabled={busy} onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:record.id,dealerID:record.dealer_id}})} /><Button title={i18n.t('scan.view.refresh')} color={theme.accent} disabled={busy} onPress={refresh} />
 {profile?<InventoryScanActions userID={profile.id} dealerID={record.dealer_id} recordID={record.id} onObserved={observed} onDenied={denied} onIntent={intent} onBusy={onBusy} />:null}
 </>:null}
 </View>;
}
export default function ScanScreen(){
 const auth=useMobileSession();const {i18n,scanEntry,scanState}=auth;const theme=useNativeTheme();const router=useRouter();const focused=useIsFocused();
 const [actionBusy,setActionBusy]=useState(false);usePreventRemove(actionBusy,()=>{});
 const [foreground,setForeground]=useState(AppState.currentState==='active');const [input,setInput]=useState('');const [torch,setTorch]=useState(false);const [issue,setIssue]=useState<'invalid'|'denied'|'failed'|null>(null);
 const [permission,requestPermission,getPermission]=useNativeScanPermission();const activeScreen=useRef(false);
 const [cameraModel]=useState(()=>createInventoryScanCamera({active:()=>activeScreen.current&&AppState.currentState==='active',acquire:async()=>{try{return(await requestPermission()).granted;}finally{await waitPermissionForeground({active:()=>AppState.currentState==='active',subscribe:changed=>{const listener=AppState.addEventListener('change',changed);return()=>listener.remove();},after:(ms,work)=>{const timer=setTimeout(work,ms);return()=>clearTimeout(timer);}});}}}));const [cameraState,setCameraState]=useState(cameraModel.snapshot());
 useEffect(()=>{const unsubscribe=cameraModel.subscribe(setCameraState);return()=>{unsubscribe();cameraModel.dispose();};},[cameraModel]);
 useLayoutEffect(()=>{activeScreen.current=focused&&auth.ready;return()=>{activeScreen.current=false;cameraModel.cancel();};},[focused,auth.ready]);
 useEffect(()=>{setTorch(false);setInput('');cameraModel.cancel();},[auth.profile?.id]);
 useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{setForeground(state==='active');if(state!=='active'){setTorch(false);setInput('');if(!cameraModel.snapshot().busy)cameraModel.cancel();}else{void getPermission().catch(()=>{});}});return()=>subscription.remove();},[getPermission]);
 useEffect(()=>{if(!focused){setTorch(false);setInput('');cameraModel.cancel();}},[focused]);
 function cancel(){if(actionBusy)return;cameraModel.cancel();scanEntry.clear();setInput('');router.replace('/');}
 useFocusEffect(useCallback(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(!actionBusy){cameraModel.cancel();scanEntry.clear();router.replace('/');}return true;});return()=>subscription.remove();},[scanEntry,router,actionBusy,cameraModel]));
 function startCamera(){setIssue(null);Keyboard.dismiss();void cameraModel.start();}
 function accept(value:string,ticket?:number){if(!activeScreen.current||AppState.currentState!=='active'||(ticket!==undefined&&!cameraModel.consume(ticket)))return;cameraModel.cancel();setTorch(false);setInput('');Keyboard.dismiss();setIssue(scanEntry.open(value,auth.profile?.id??null)?null:'invalid');}
 const text={color:theme.text,fontSize:17};
 return <><Stack.Screen options={{title:i18n.t('scan.native.open'),gestureEnabled:false,headerLeft:()=> <Button title={i18n.t('scan.view.cancel')} color={theme.accent} disabled={actionBusy} onPress={cancel} />}} />
 <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{padding:20,gap:20,flexGrow:1}}>
 {!auth.ready?<Text style={text}>{i18n.t('common.loading')}</Text>:scanState.pending?<>
 {auth.session&&auth.profile?focused&&foreground?<ScanResult busy={actionBusy} onBusy={setActionBusy} key={JSON.stringify([auth.profile.id,scanState.version])} />:null:<><Text style={text}>{i18n.t('scan.native.signIn')}</Text>{auth.errorKey?<Text accessibilityRole="alert" style={text}>{i18n.t(auth.errorKey)}</Text>:null}<Button title={i18n.t('auth.signIn')} color={theme.accent} disabled={!auth.signInReady||!!auth.session} onPress={()=>void auth.signIn()} /></>}
 <Button title={i18n.t('scan.native.again')} color={theme.accent} disabled={actionBusy} onPress={()=>{scanEntry.clear();setIssue(null);}} />
 </>:<>
 <Text style={{...text,color:theme.secondary}}>{i18n.t('scan.native.hint')}</Text>
 {issue||cameraState.failure?<Text accessibilityRole="alert" style={text}>{i18n.t(issue==='invalid'?'scan.view.invalid':(issue??cameraState.failure)==='denied'?'scan.native.denied':'scan.native.failed')}</Text>:null}
 {cameraState.visible&&focused&&foreground&&permission?.granted?<><NativeScanCamera ticket={cameraState.ticket} torch={torch} onResult={(ticket,value)=>accept(value,ticket)} onFailure={ticket=>{cameraModel.fail(ticket);setTorch(false);}} /><Button title={i18n.t(torch?'scan.native.torchOff':'scan.native.torchOn')} color={theme.accent} onPress={()=>setTorch(value=>!value)} /><Button title={i18n.t('inventory.publication.cancel')} color={theme.accent} onPress={()=>{cameraModel.cancel();setTorch(false);}} /></>:<Button title={i18n.t('scan.native.camera')} color={theme.accent} disabled={cameraState.busy} onPress={()=>void startCamera()} />}
 <Text style={text}>{i18n.t('scan.native.manual')}</Text><TextInput accessibilityLabel={i18n.t('scan.native.manual')} value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" maxLength={2048} onSubmitEditing={()=>accept(input)} style={{...text,minHeight:48,borderWidth:1,borderColor:theme.border,borderRadius:10,padding:12,backgroundColor:theme.surface}} />
 <Button title={i18n.t('scan.native.useLink')} color={theme.accent} disabled={!input} onPress={()=>accept(input)} />
 </>}
 </ScrollView></>;
}
