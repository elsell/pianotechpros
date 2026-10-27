import {NativeChoiceIndicator} from '../../src/native-choice-indicator';
import {NativeButton as Button} from '../../src/native-button';
import {inventoryScanLabelTitle} from '@pianotechpros/client-core';
import {useEffect,useRef,useState} from 'react';
import {InputAccessoryView,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {usePreventRemove,useRoute} from '@react-navigation/native';
import {Redirect,Stack,useLocalSearchParams,useNavigation,useRouter} from 'expo-router';
import {InventoryClientError} from '@pianotechpros/api-client';
import {openInventoryCapture,openInventoryFormWorkspace,handoffCapturePhoto,discardCapturePhoto,inventoryTextFields,inventoryForms,inventoryConditions,inventoryCurrencies,inventoryFormErrors,type InventoryForm,type InventoryFormField,type InventoryFormWorkspace,type InventoryTextField} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../../src/session-provider';
import {useInventoryRequest} from '../../src/use-inventory-request';
import {useNativeTheme} from '../../src/native-theme';
import {randomUUID} from 'expo-crypto';
import {claimMobileInventoryCapture,claimMobileInventoryPhotos} from '../../src/inventory/capture-lease';
import {openMobileInventoryRecovery} from '../../src/inventory/recovery-storage';
import {InventoryPublication} from '../../src/inventory/InventoryPublication';
import {InventoryPhotos} from '../../src/inventory/InventoryPhotos';
import {InventoryScanLabel} from '../../src/inventory/InventoryScanLabel';
import {InventoryHistory} from '../../src/inventory/InventoryHistory';
import {InventoryVoice} from '../../src/inventory/InventoryVoice';
import {mobilePhotoDigest} from '../../src/inventory/photo-media';
type Choice='form'|'condition'|'asking_currency'|'cost_currency';
function Editor({userID,dealerID,recordID:routeRecordID}:{userID:string;dealerID:string;recordID:string}){
 const [recordID]=useState(routeRecordID);const router=useRouter();
 const {i18n}=useMobileSession();const theme=useNativeTheme();const request=useInventoryRequest();const navigation=useNavigation();
 const workspace=useRef<InventoryFormWorkspace|null>(null);
 const [state,setState]=useState<ReturnType<InventoryFormWorkspace['snapshot']>|null>(null);
 const [publicationBusy,setPublicationBusy]=useState(false);
 const [photoBusy,setPhotoBusy]=useState(false);const [voiceBusy,setVoiceBusy]=useState(false);const [voicePaused,setVoicePaused]=useState(false);
 const [loading,setLoading]=useState(true);const [failed,setFailed]=useState(false);const [denied,setDenied]=useState(false);const [captureBusy,setCaptureBusy]=useState(false);const [attempt,setAttempt]=useState(0);const [internal,setInternal]=useState(false);const [choice,setChoice]=useState<Choice|null>(null);
 useEffect(()=>{
  let active=true;let current:InventoryFormWorkspace|null=null;let unsubscribe=()=>{};
  setLoading(true);setFailed(false);setDenied(false);setCaptureBusy(false);
  void (async()=>{try{
   const base={decimal:i18n.locale==='es'?',' as const:'.' as const,active:()=>active,now:Date.now,storage:()=>openMobileInventoryRecovery(userID),classify:(error:unknown)=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied' as const:error instanceof InventoryClientError&&error.code==='conflict'?'conflict' as const:error instanceof InventoryClientError&&[400,422].includes(error.status)?'rejected' as const:'uncertain' as const,schedule:(run:()=>void)=>{const timer=setTimeout(run,800);return()=>clearTimeout(timer);}};
   current=recordID==='new'?await openInventoryCapture({...base,media:{sha256:mobilePhotoDigest,handoff:(id,selection)=>handoffCapturePhoto({userID,dealerID,recordID:id,selection,active:()=>active,authorize:async()=>{await request(api=>api.get(dealerID,id));},lease:()=>claimMobileInventoryPhotos(userID,dealerID,id),storage:base.storage,sha256:mobilePhotoDigest,now:Date.now}),discard:(id,selection)=>discardCapturePhoto({userID,dealerID,recordID:id,selection,active:()=>active,authorize:async()=>{await request(api=>api.get(dealerID,id));},lease:()=>claimMobileInventoryPhotos(userID,dealerID,id),storage:base.storage,sha256:mobilePhotoDigest,now:Date.now})},userID,dealerID,key:randomUUID,authorize:async()=>{await request(api=>api.list(dealerID,{limit:1}));},lease:()=>claimMobileInventoryCapture(userID,dealerID),create:key=>request(api=>api.createDraft(dealerID,key)),get:id=>request(api=>api.get(dealerID,id)),edit:(id,attributes,revision,fields)=>request(api=>api.edit(dealerID,id,attributes,revision,fields)),onCreated:id=>{if(active)router.setParams({id});}})
    :await openInventoryFormWorkspace({...base,scope:{userID,dealerID,recordID},get:()=>request(api=>api.get(dealerID,recordID)),edit:(attributes,revision,fields)=>request(api=>api.edit(dealerID,recordID,attributes,revision,fields))});
   if(!active){current?.dispose();return;}workspace.current=current;if(current)unsubscribe=current.subscribe(setState);
  }catch(error){if(active){setFailed(true);setCaptureBusy(error instanceof Error&&error.message==='inventory_capture_busy');setDenied(error instanceof InventoryClientError&&[401,403,404].includes(error.status));}}finally{if(active)setLoading(false);}})();
  return()=>{active=false;unsubscribe();current?.dispose();if(workspace.current===current)workspace.current=null;};
 },[userID,dealerID,recordID,request,attempt]);
 usePreventRemove(publicationBusy||photoBusy||voiceBusy||!!state&&!state.denied&&state.recovery!=='ready',({data})=>{if(publicationBusy||photoBusy||voiceBusy)return;void (async()=>{if(await workspace.current?.flush())navigation.dispatch(data.action);})();});
 const labelKey=['scan',userID,dealerID,workspace.current?.recordID()].join(':');
 const historyKey=[userID,dealerID,workspace.current?.recordID()].join(':');
 const draft=state?.draft;const errors=draft?inventoryFormErrors(draft).filter(field=>state?.baseline||field!=='stock_number'):[];
 const label=(field:InventoryFormField)=>i18n.t(`inventory.field.${field}` as MessageKey);
 function change(field:InventoryFormField,value:string|boolean){const latest=workspace.current?.snapshot().draft;if(latest)workspace.current?.change({...latest,[field]:value});}
 function display(form:InventoryForm,field:InventoryFormField){const value=form[field];if(typeof value==='boolean')return i18n.t(value?'inventory.edit.yes':'inventory.edit.no');if(!value)return i18n.t('inventory.edit.unknown');if(field==='form'||field==='condition')return i18n.t(`inventory.${field}.${value}` as MessageKey);return value;}
 const copyStyle={color:theme.text,fontSize:17};
 function field(key:InventoryTextField|'year'|'month'|'day'|'asking_amount'|'cost_amount',multiline=false){if(!draft)return null;const numeric=['year','month','day','asking_amount','cost_amount'].includes(key);return <View key={key} style={{gap:6}}><Text style={{color:theme.secondary,fontSize:15}}>{label(key)}</Text><TextInput accessibilityLabel={label(key)} accessibilityHint={errors.includes(key)?i18n.t('inventory.edit.invalidField'):undefined} value={draft[key]} onChangeText={value=>change(key,value)} multiline={multiline} keyboardType={numeric?'decimal-pad':'default'} autoCorrect={!numeric&&key!=='serial'&&key!=='stock_number'} autoCapitalize={numeric?'none':'sentences'} inputAccessoryViewID={Platform.OS==='ios'?'inventory-keyboard':undefined} maxLength={key in inventoryTextFields?inventoryTextFields[key as InventoryTextField]*2:key==='year'?4:key==='month'||key==='day'?2:40} style={{...copyStyle,minHeight:multiline?120:48,textAlignVertical:multiline?'top':'center',backgroundColor:theme.surface,borderColor:errors.includes(key)?'#bb4040':theme.border,borderWidth:errors.includes(key)?2:1,borderRadius:10,padding:12}} />{errors.includes(key)?<Text style={copyStyle}>{i18n.t('inventory.edit.invalidField')}</Text>:null}</View>;}
 function toggle(key:'featured'|'player_system'|'price_visible'){if(!draft)return null;return <View key={key} style={{flexDirection:'row',alignItems:'center',gap:16,minHeight:52}}><Text style={{...copyStyle,flex:1}}>{label(key)}</Text><Switch accessibilityLabel={label(key)} value={draft[key]} onValueChange={value=>change(key,value)} /></View>;}
 function choose(key:Choice){if(!draft)return null;return <Pressable key={key} accessibilityRole="button" accessibilityLabel={i18n.t('inventory.edit.choose',{field:label(key)})} onPress={()=>{Keyboard.dismiss();setChoice(key);}} style={({pressed})=>({padding:16,minHeight:52,borderRadius:10,backgroundColor:theme.surface,borderColor:theme.border,borderWidth:1,opacity:pressed?.6:1,gap:4})}><Text style={{color:theme.secondary,fontSize:15}}>{label(key)}</Text><Text style={copyStyle}>{display(draft,key)}</Text></Pressable>;}
 function heading(key:MessageKey){return <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'600',marginTop:16}}>{i18n.t(key)}</Text>;}
 return <><Stack.Screen options={{title:i18n.t(recordID==='new'&&!state?.baseline?'inventory.edit.new':'inventory.edit.editor'),headerBackButtonMenuEnabled:false}} />
 <KeyboardAvoidingView style={{flex:1}} enabled={Platform.OS==='android'} behavior="height"><ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16,paddingBottom:40}}>
 {loading?<Text style={copyStyle}>{i18n.t('common.loading')}</Text>:null}
 {failed?<><Text accessibilityRole="alert" style={copyStyle}>{i18n.t(denied?'inventory.denied':captureBusy?'inventory.edit.captureBusy':'inventory.edit.loadFailed')}</Text><Button title={i18n.t('inventory.retry')}  onPress={()=>setAttempt(v=>v+1)} disabled={loading} /></>:null}
 {state?.denied?<Text accessibilityRole="alert" style={copyStyle}>{i18n.t('inventory.denied')}</Text>:null}
 {draft&&state?<>
 <Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.edit.privateDraft')}</Text>
 <Text accessibilityLiveRegion="polite" style={copyStyle}>{i18n.t(state.recovery==='failed'?'inventory.edit.storageFailed':state.recovery==='writing'?'inventory.edit.localSaving':voicePaused?'voice.paused':state.busy?'inventory.edit.saving':state.restored?'inventory.edit.restored':state.conflict?'inventory.edit.conflict':state.uncertain?'inventory.edit.uncertain':state.failure?'inventory.edit.saveFailed':state.invalid?'inventory.edit.invalid':state.dirty?'inventory.edit.unsaved':!state.baseline?'inventory.edit.newReady':'inventory.edit.saved')}</Text>
 {workspace.current?<InventoryPhotos workspace={workspace.current} userID={userID} dealerID={dealerID} onBusy={setPhotoBusy} otherBusy={voiceBusy||publicationBusy} />:null}
 {workspace.current?<InventoryVoice workspace={workspace.current} userID={userID} dealerID={dealerID} otherBusy={photoBusy||publicationBusy} onBusy={setVoiceBusy} onPaused={setVoicePaused} />:null}
 {heading('inventory.edit.identity')}{(['make','model','title','size','finish'] as const).map(key=>field(key))}{choose('form')}{choose('condition')}{toggle('player_system')}
 {heading('inventory.edit.date')}<Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.edit.dateHint')}</Text>{field('year')}{field('month')}{field('day')}
 {heading('inventory.edit.offering')}{field('description',true)}<Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.edit.moneyHint',{separator:draft.decimal})}</Text>{field('asking_amount')}{choose('asking_currency')}{toggle('price_visible')}{toggle('featured')}
 <Pressable accessibilityRole="button" accessibilityState={{expanded:internal}} onPress={()=>setInternal(v=>!v)} style={{paddingVertical:16,minHeight:52}}><Text style={{color:theme.accent,fontSize:20,fontWeight:'600'}}>{i18n.t('inventory.edit.internal')}</Text></Pressable>
 {internal?<>{(['stock_number','serial','location'] as const).map(key=>field(key))}{field('cost_amount')}{choose('cost_currency')}{field('private_notes',true)}</>:null}
 {state.conflict||state.uncertain?<Button title={i18n.t('inventory.edit.review')}  disabled={state.busy} onPress={()=>{void workspace.current?.recover();}} />:null}
 {state.latest?<View style={{gap:16}}>{(Object.keys(draft) as (keyof InventoryForm)[]).filter((key):key is InventoryFormField=>key!=='decimal').filter(key=>state.latest!.attributes[key]!==draft[key]).map(key=><View key={key} style={{gap:6}}><Text accessibilityRole="header" style={{...copyStyle,fontWeight:'600'}}>{label(key)}</Text><Text style={{color:theme.secondary}}>{i18n.t('inventory.edit.current')}</Text><Text style={copyStyle}>{display(state.latest!.attributes,key)}</Text><Text style={{color:theme.secondary}}>{i18n.t('inventory.edit.yours')}</Text><Text style={copyStyle}>{display(draft,key)}</Text></View>)}<Button title={i18n.t('inventory.edit.keep')}  onPress={()=>workspace.current?.keepEdits()} /><Button title={i18n.t('inventory.edit.useLatest')}  onPress={()=>workspace.current?.useLatest()} /></View>:null}
 <Button title={i18n.t('inventory.edit.save')}  disabled={publicationBusy||photoBusy||voiceBusy||state.busy||state.conflict} onPress={()=>{Keyboard.dismiss();void workspace.current?.save();}} />
 {workspace.current&&state.baseline&&!state.denied?<InventoryScanLabel key={labelKey} dealerID={dealerID} recordID={workspace.current.recordID()} stock={state.baseline.attributes.stock_number} title={inventoryScanLabelTitle(state.baseline.attributes)}/>:null}
 {workspace.current&&state.baseline&&!state.denied?<InventoryHistory key={historyKey} userID={userID} dealerID={dealerID} recordID={workspace.current.recordID()} />:null}
 {workspace.current&&state.baseline?<InventoryPublication key={workspace.current.recordID()} workspace={workspace.current} userID={userID} dealerID={dealerID} recordID={workspace.current.recordID()} publishReady={!state.restored&&!state.invalid&&!state.conflict&&!state.uncertain} otherBusy={photoBusy||voiceBusy} onBusy={setPublicationBusy} />:null}
 </>:null}
 </ScrollView></KeyboardAvoidingView>
 {Platform.OS==='ios'?<InputAccessoryView nativeID="inventory-keyboard"><View style={{backgroundColor:theme.surface,alignItems:'flex-end',paddingHorizontal:12}}><Button title={i18n.t('inventory.edit.done')}  onPress={Keyboard.dismiss} /></View></InputAccessoryView>:null}
 <Modal visible={!!choice&&!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setChoice(null)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:20,gap:12}}>{choice&&draft?<><Text accessibilityRole="header" style={{...copyStyle,fontSize:24,fontWeight:'600'}}>{label(choice)}</Text>{(choice==='form'?inventoryForms:choice==='condition'?inventoryConditions:inventoryCurrencies).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:draft[choice]===value}} onPress={()=>{change(choice,value);setChoice(null);}} style={{flexDirection:'row',alignItems:'center',padding:16,minHeight:52,borderRadius:10,backgroundColor:theme.surface,borderWidth:draft[choice]===value?2:1,borderColor:draft[choice]===value?theme.accent:theme.border}}><NativeChoiceIndicator checked={draft[choice]===value}/><Text style={{...copyStyle,flex:1}}>{!value?i18n.t('inventory.edit.unknown'):choice==='form'||choice==='condition'?i18n.t(`inventory.${choice}.${value}` as MessageKey):value}</Text></Pressable>)}</>:null}<Button title={i18n.t('inventory.edit.done')}  onPress={()=>setChoice(null)} /></ScrollView></SafeAreaView></Modal>
 </>;
}
export default function InventoryEditorScreen(){
 const route=useRoute();const {dealerID,id}=useLocalSearchParams<{dealerID:string;id:string}>();const auth=useMobileSession();const theme=useNativeTheme();
 if(!auth.ready)return <View style={{padding:20}}><Text style={{color:theme.text}}>{auth.i18n.t('common.loading')}</Text></View>;
 if(!auth.session||!auth.profile||typeof dealerID!=='string'||typeof id!=='string')return <Redirect href="/" />;
 return <Editor key={JSON.stringify([auth.profile.id,dealerID,route.key])} userID={auth.profile.id} dealerID={dealerID} recordID={id} />;
}
