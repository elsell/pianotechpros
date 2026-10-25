import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Keyboard,KeyboardAvoidingView,Modal,Platform,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import {nativeVoiceFailure} from './voice-failure';
import {createInventoryVoiceWorkspace,inventoryFormFromAttributes,type InventoryForm,type InventoryFormWorkspace,type InventoryVoiceCandidate,type InventoryVoiceField,type InventoryVoiceWorkspaceState,type NativeVoiceState} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {useInventoryVoiceRequest} from '../use-inventory-request';
import {createMobileVoiceCapture} from './voice-media';
const idle:NativeVoiceState={phase:'idle',issue:null,busy:false};
export function InventoryVoice({workspace,userID,dealerID,otherBusy,onBusy,onPaused}:{workspace:InventoryFormWorkspace;userID:string;dealerID:string;otherBusy:boolean;onBusy:(busy:boolean)=>void;onPaused:(paused:boolean)=>void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const request=useInventoryVoiceRequest();const focused=useIsFocused();
 const model=useRef<{coordinator:ReturnType<typeof createInventoryVoiceWorkspace>;capture:ReturnType<typeof createMobileVoiceCapture>;active():boolean}|null>(null);
 const [state,setState]=useState<InventoryVoiceWorkspaceState>({busy:false,paused:false,voice:null,issue:null});const [capture,setCapture]=useState(idle);
 const [open,setOpen]=useState(false),[transcript,setTranscript]=useState(''),[selected,setSelected]=useState<InventoryVoiceField[]>([]),[showTranscript,setShowTranscript]=useState(false);
 const scroll=useRef<ScrollView>(null);const voice=state.voice;
 useEffect(()=>{
  let alive=true,denied=false;
  const active=()=>alive&&focused&&!denied&&AppState.currentState!=='background'&&!workspace.snapshot().denied&&!!workspace.snapshot().draft;
  const coordinator=createInventoryVoiceWorkspace({accountID:userID,dealerID,active,snapshot:()=>workspace.snapshot(),change:form=>workspace.change(form),withMutation:work=>workspace.withMediaMutation(work),
   ...('ensureRecord'in workspace?{ensureRecord:()=> (workspace.ensureRecord as ()=>Promise<string|null>)()}:{}),
   transcribe:(id,revision,bytes,mime,signal)=>request(api=>api.transcribe(dealerID,id,revision,bytes,mime,signal)),extract:(id,revision,text,signal)=>request(api=>api.extract(dealerID,id,revision,text,signal)),
   classify:nativeVoiceFailure,
  });
  const recorder=createMobileVoiceCapture({active,changed:value=>{if(alive)setCapture(value);},completed:bytes=>{if(active())void coordinator.process(bytes,'audio/mp4');else bytes.fill(0);}});
  const current={coordinator,capture:recorder,active};model.current=current;
  setOpen(false);setTranscript('');setSelected([]);setShowTranscript(false);setCapture(idle);
  let phase='idle';
  const unsubscribe=coordinator.subscribe(next=>{if(!alive)return;setState(next);if(next.voice?.transcript)setTranscript(next.voice.transcript);
   if(next.voice?.phase==='review'&&phase!=='review'){setSelected([]);setShowTranscript(false);Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:false});}
   phase=next.voice?.phase??'idle';if(next.issue==='denied'){denied=true;setTranscript('');setSelected([]);setOpen(false);void recorder.cancel();}
  });
  const clear=()=>{coordinator.cancel();void recorder.cancel();if(alive){setOpen(false);setTranscript('');setSelected([]);}};
  const unwatch=workspace.subscribe(value=>{if(value.denied){clear();coordinator.reconcile();}});
  const lifecycle=AppState.addEventListener('change',value=>{if(value==='background')clear();});
  return()=>{alive=false;unsubscribe();unwatch();lifecycle.remove();coordinator.dispose();void recorder.dispose();if(model.current===current)model.current=null;};
 },[workspace,userID,dealerID,request,focused]);
 const busy=state.busy||capture.busy,denied=state.issue==='denied';
 useEffect(()=>{onBusy(busy||open);return()=>onBusy(false);},[busy,open,onBusy]);
 useEffect(()=>{onPaused(state.paused);return()=>onPaused(false);},[state.paused,onPaused]);
 const t=(key:string)=>i18n.t(`voice.${key}` as MessageKey);const text={color:theme.text,fontSize:17};const secondary={color:theme.secondary,fontSize:16};
 const label=(field:InventoryVoiceField)=>i18n.t(field==='manufactured'?'inventory.edit.date':`inventory.field.${field==='asking_price'?'asking_amount':field==='acquisition_cost'?'cost_amount':field}` as MessageKey);
 function value(form:InventoryForm,field:InventoryVoiceField){
  if(field==='manufactured')return i18n.t('voice.dateValue',{year:form.year||i18n.t('inventory.edit.unknown'),month:form.month||i18n.t('inventory.edit.unknown'),day:form.day||i18n.t('inventory.edit.unknown')});
  if(field==='asking_price'||field==='acquisition_cost')return i18n.t('voice.moneyValue',{amount:(field==='asking_price'?form.asking_amount:form.cost_amount)||i18n.t('inventory.edit.unknown'),currency:field==='asking_price'?form.asking_currency:form.cost_currency});
  const v=form[field];if(typeof v==='boolean')return i18n.t(v?'inventory.edit.yes':'inventory.edit.no');if(!v)return i18n.t('inventory.edit.unknown');return field==='form'||field==='condition'?i18n.t(`inventory.${field}.${v}` as MessageKey):v;
 }
 function proposed(candidate:InventoryVoiceCandidate){const v=candidate.value;return value(inventoryFormFromAttributes({stock_number:'',[candidate.field]:v.text??v.boolean??v.money??v.date},voice?.reviewed?.decimal??'.'),candidate.field);}
 function cancel(){model.current?.coordinator.cancel();void model.current?.capture.cancel();Keyboard.dismiss();setOpen(false);setTranscript('');setSelected([]);}
 function enter(){if(otherBusy||busy||denied||!model.current?.active())return;Keyboard.dismiss();setOpen(true);}
 function process(){const current=model.current;if(!current?.active()||busy||!transcript.trim())return;Keyboard.dismiss();void current.coordinator.extractTranscript(transcript);}
 function apply(){const current=model.current;if(!current?.active())return;current.coordinator.apply(selected);if(current.coordinator.snapshot().voice?.phase==='applied'){setOpen(false);setTranscript('');setSelected([]);}}
 function editTranscript(){const text=voice?.transcript??transcript;model.current?.coordinator.cancel();setSelected([]);setTranscript(text);}
 const issue=state.issue||(voice?.phase==='applied'&&voice.conflicts.length?'undoConflict':voice?.issue);
 const button=(key:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} onPress={action} disabled={disabled} style={({pressed})=>({minHeight:48,padding:12,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:key==='apply'?theme.accent:'transparent',opacity:disabled?.45:pressed?.65:1})}><Text style={{fontSize:17,fontWeight:key==='apply'?'600':'400',color:key==='apply'?theme.background:theme.accent,textAlign:'center'}}>{t(key)}</Text></Pressable>;
 const feedback=<>{issue?<Text accessibilityRole="alert" style={text}>{t(`error.${issue}`)}</Text>:null}{voice?.phase==='transcribing'||voice?.phase==='extracting'?<Text accessibilityLiveRegion="polite" style={text}>{t(voice.phase)}</Text>:state.busy&&!voice?<Text accessibilityLiveRegion="polite" style={text}>{t('preparing')}</Text>:null}</>;
 const reviewing=voice?.phase==='review';
 return <View style={{gap:12,paddingVertical:16,borderTopWidth:1,borderColor:theme.border}}>
 <Text accessibilityRole="header" style={{...text,fontSize:22,fontWeight:'600'}}>{t('title')}</Text><Text style={secondary}>{t('hint')}</Text>
 {button('open',enter,otherBusy||busy||denied)}
 {!open?<>{feedback}{capture.issue==='cleanup'?<><Text accessibilityRole="alert" style={text}>{t('nativeCleanupFailed')}</Text>{button('retryCleanup',()=>{void model.current?.capture.retryCleanup();})}</>:null}</>:null}
 {voice?.phase==='applied'?<Text accessibilityLiveRegion="polite" style={text}>{t('applied')}</Text>:null}
 {voice?.canUndo?button('undo',()=>model.current?.coordinator.undo(),busy||otherBusy):null}
 <Modal visible={open&&focused} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
 <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:theme.background}} accessibilityViewIsModal onAccessibilityEscape={cancel}>
 <View style={{paddingHorizontal:16,paddingVertical:8,borderBottomWidth:1,borderColor:theme.border}}>{button('cancel',cancel)}<Text accessibilityRole="header" style={{...text,fontSize:24,fontWeight:'600'}}>{t(reviewing?'review':'title')}</Text></View>
 <KeyboardAvoidingView key={reviewing?'review':'capture'} style={{flex:1}} enabled={Platform.OS==='android'&&!reviewing} behavior="height"><ScrollView ref={scroll} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16,paddingBottom:40}}>
 {feedback}
 {capture.busy?<><Text accessibilityLiveRegion="polite" style={text}>{t(`capture.${capture.phase==='preparing'?'preparing':capture.phase==='idle'||capture.phase==='failed'?'stopping':capture.phase}`)}</Text>{capture.phase==='recording'?button('stop',()=>{void model.current?.capture.stop();}):null}</>:null}
 {capture.issue?<Text accessibilityRole="alert" style={text}>{t(capture.issue==='permission'?'nativePermissionDenied':capture.issue==='cleanup'?'nativeCleanupFailed':`captureError.${capture.issue}`)}</Text>:null}
 {reviewing&&voice.proposal&&voice.reviewed?<>
 {button(showTranscript?'hideTranscript':'showTranscript',()=>setShowTranscript(v=>!v))}{showTranscript?<Text selectable style={text}>{voice.transcript}</Text>:null}
 {!voice.proposal.candidates.length?<Text style={text}>{t('empty')}</Text>:null}
 {voice.proposal.candidates.map(candidate=><View key={candidate.field} style={{padding:16,gap:12,borderRadius:12,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border}}>
 <View style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:52}}><Text accessibilityRole="header" style={{...text,fontWeight:'600',flex:1}}>{label(candidate.field)}</Text><Switch accessibilityLabel={i18n.t('voice.select',{field:label(candidate.field)})} value={selected.includes(candidate.field)} onValueChange={checked=>setSelected(old=>checked?[...old.filter(field=>field!==candidate.field),candidate.field]:old.filter(field=>field!==candidate.field))} /></View>
 <Text style={secondary}>{t('current')}</Text><Text selectable style={text}>{value(voice.reviewed!,candidate.field)}</Text><Text style={secondary}>{t('proposed')}</Text><Text selectable style={text}>{proposed(candidate)}</Text>
 <Text style={secondary}>{t(`confidence.${candidate.confidence}`)}</Text><Text selectable style={text}>{candidate.evidence}</Text>
 </View>)}
 {voice.conflicts.length?button('renew',()=>{model.current?.coordinator.refreshReview();setSelected([]);}):null}
 {button('editTranscript',editTranscript)}
 </>:!busy?<><Text style={secondary}>{t('hint')}</Text>{button('record',()=>{Keyboard.dismiss();model.current?.coordinator.cancel();setTranscript('');void model.current?.capture.start();},denied)}<Text style={secondary}>{t('transcript')}</Text>
 <TextInput accessibilityLabel={t('transcript')} value={transcript} onChangeText={setTranscript} editable={!denied} multiline maxLength={32000} style={{...text,minHeight:160,textAlignVertical:'top',padding:12,borderWidth:1,borderColor:theme.border,borderRadius:10,backgroundColor:theme.surface}} />
 {button('extract',process,denied||!transcript.trim())}</>:null}
 </ScrollView></KeyboardAvoidingView>
 {reviewing?<View style={{padding:16,borderTopWidth:1,borderColor:theme.border}}>{button('apply',apply,!selected.length)}</View>:null}
 </SafeAreaView></SafeAreaProvider></Modal>
 </View>;
}
