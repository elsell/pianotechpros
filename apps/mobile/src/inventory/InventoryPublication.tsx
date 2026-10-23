import {useEffect,useRef,useState} from 'react';
import {Button,InputAccessoryView,Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {InventoryClientError,InventoryPublicationError,type InventoryPhoto,type InventoryPublicationState,type PublicationReadinessField} from '@pianotechpros/api-client';
import {createInventoryPublicationWorkspace,inventoryCurrencies,publicationStatuses,publicationTransitionFromInput,type InventoryFormWorkspace,type PublicationCommand} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {useInventoryPhotoRequest,useInventoryPublicationRequest} from '../use-inventory-request';
import {InventoryPhotoImage} from './InventoryPhotos';
type ReviewState=InventoryPublicationState&{photos:InventoryPhoto[]};
type Controller=ReturnType<typeof createInventoryPublicationWorkspace<ReviewState>>;
export function InventoryPublication({workspace,userID,dealerID,recordID,publishReady,otherBusy,onBusy}:{workspace:InventoryFormWorkspace;userID:string;dealerID:string;recordID:string;publishReady:boolean;otherBusy:boolean;onBusy:(busy:boolean)=>void}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const request=useInventoryPublicationRequest();const photos=useInventoryPhotoRequest();
 const model=useRef<{controller:Controller;active():boolean}|null>(null);const operation=useRef(false);
 const [state,setState]=useState<ReturnType<Controller['snapshot']>|null>(null);const [screen,setScreen]=useState<'closed'|'edit'|'review'>('closed');
 const [target,setTarget]=useState<string>('available');const [amount,setAmount]=useState('');const [currency,setCurrency]=useState<string>(inventoryCurrencies[0]);const [reason,setReason]=useState('');const [invalid,setInvalid]=useState(false);const [missing,setMissing]=useState<readonly PublicationReadinessField[]>([]);const [choice,setChoice]=useState<'status'|'currency'|null>(null);const [page,setPage]=useState(0);
 useEffect(()=>{
  let alive=true;const active=()=>alive&&workspace.recordID()===recordID&&!!workspace.snapshot().draft;
  const controller=createInventoryPublicationWorkspace<ReviewState>({userID,dealerID,recordID,active,copy:value=>JSON.parse(JSON.stringify(value)),withMutation:work=>workspace.withMediaMutation(work),
   get:async()=>{const value=await request(api=>api.get(dealerID,recordID));const collection=await photos(api=>api.list(dealerID,recordID));if(collection.record.revision!==value.record.revision)throw new InventoryClientError('conflict',409);return {...value,photos:collection.photos};},
   execute:async(command,revision)=>{try{return {...await request(api=>command.kind==='publish'?api.publish(dealerID,recordID,revision):command.kind==='unpublish'?api.unpublish(dealerID,recordID,revision):api.transition(dealerID,recordID,revision,command.status,command.salePrice,command.reason)),photos:[]};}catch(error){if(active()&&error instanceof InventoryPublicationError)setMissing(error.missing);throw error;}},
   classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='conflict'?'conflict':error instanceof InventoryClientError&&[400,422].includes(error.status)?'rejected':'uncertain',
  });
  const current={controller,active};model.current=current;operation.current=false;setScreen('closed');setMissing([]);setAmount('');setReason('');
  const unsubscribe=controller.subscribe(value=>{if(active()){setState(value);if(value.failure==='denied'){setScreen('closed');setAmount('');setReason('');}}});
  void controller.refresh().catch(()=>{});
  return()=>{alive=false;unsubscribe();controller.dispose();if(model.current===current)model.current=null;};
 },[workspace,userID,dealerID,recordID,request,photos]);
 const busy=!!state?.busy;const disabled=busy||otherBusy||!state||state.failure==='denied';
 useEffect(()=>{onBusy(busy||screen!=='closed');return()=>onBusy(false);},[busy,screen,onBusy]);
 const t=(key:string)=>i18n.t(`inventory.publication.${key}` as MessageKey);
 const statusLabel=(status:string)=>i18n.t(`inventory.status.${status}` as MessageKey);
 const text={color:theme.text,fontSize:17};const secondary={color:theme.secondary,fontSize:16};
 const button=(key:string,action:()=>void,blocked=disabled)=><Button title={t(key)} color={theme.accent} onPress={action} disabled={blocked} />;
 function cancel(){const current=model.current;if(operation.current||current?.controller.snapshot().busy)return;current?.controller.cancel();Keyboard.dismiss();setScreen('closed');setChoice(null);setMissing([]);}
 async function run(work:(current:NonNullable<typeof model.current>)=>Promise<void>){const current=model.current;if(!current||!current.active()||operation.current)return;operation.current=true;setMissing([]);setInvalid(false);try{await work(current);}catch{/* Stable controller state and validated readiness identifiers own feedback. */}finally{if(model.current===current&&current.active())operation.current=false;}}
 function review(command:PublicationCommand){if(command.kind==='publish'&&!publishReady)return;Keyboard.dismiss();void run(async current=>{await current.controller.review(command);if(current.active()){setPage(0);setChoice(null);setScreen('review');}});}
 function changeStatus(){let command:PublicationCommand;try{command=publicationTransitionFromInput({status:target,amount,currency,reason},state?.state?.record.status??'',i18n.locale==='es'?',':'.');}catch{setInvalid(true);return;}review(command);}
 function confirm(){void run(async current=>{const command=current.controller.snapshot().review?.command;try{await current.controller.confirm();}finally{if(current.active()){const result=current.controller.snapshot();if(result.outcome==='succeeded'){setAmount('');setReason('');}setScreen(result.failure==='rejected'&&command?.kind==='transition'?'edit':'closed');}}});}
 const feedback=<>{busy?<Text accessibilityLiveRegion="polite" style={text}>{t('busy')}</Text>:null}{state?.outcome==='unknown'?<Text accessibilityRole="alert" style={text}>{t('unknown')}</Text>:state?.failure?<Text accessibilityRole="alert" style={text}>{state.failure==='denied'?i18n.t('inventory.denied'):t(state.failure==='conflict'?'conflict':'failed')}</Text>:screen==='closed'&&state?.outcome==='succeeded'?<Text accessibilityLiveRegion="polite" style={text}>{t('success')}</Text>:null}{missing.map(field=><Text key={field} accessibilityRole="alert" style={text}>{t(`missing.${field}`)}</Text>)}</>;
 const reviewed=state?.review;const attributes=reviewed?.state.record.attributes;
 function row(label:string,value:string){return <View key={label} style={{gap:4}}><Text style={secondary}>{label}</Text><Text style={text}>{value}</Text></View>;}
 return <View style={{gap:12,paddingVertical:20,borderTopWidth:1,borderColor:theme.border}}>
 <Text accessibilityRole="header" style={{...text,fontSize:22,fontWeight:'600'}}>{t('heading')}</Text>
 {state?.state?<Text style={secondary}>{statusLabel(state.state.record.status)} · {t(state.state.publication?.visible?'visible':state.state.publication?'hidden':'absent')}</Text>:null}
 {screen==='closed'?feedback:null}{!publishReady?<Text style={secondary}>{t('saveFirst')}</Text>:null}
 {button('publish',()=>review({kind:'publish'}),disabled||!publishReady)}
 {button('unpublish',()=>review({kind:'unpublish'}),disabled||!state?.state?.publication?.visible)}
 {button('change',()=>{Keyboard.dismiss();setInvalid(false);setChoice(null);setTarget(state?.state?.record.status??'available');setScreen('edit');})}
 {button('refresh',()=>{void run(async current=>{await current.controller.refresh();});},busy||otherBusy)}
 <Modal visible={screen!=='closed'&&!!model.current?.active()} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
 <SafeAreaView style={{flex:1,backgroundColor:theme.background}} accessibilityViewIsModal onAccessibilityEscape={cancel}>
 <View style={{paddingHorizontal:16,paddingVertical:8,borderBottomWidth:1,borderColor:theme.border}}>{button('cancel',cancel,busy)}<Text accessibilityRole="header" style={{...text,fontSize:24,fontWeight:'600'}}>{t(screen==='review'?'review':'target')}</Text></View>
 <KeyboardAvoidingView style={{flex:1}} enabled={Platform.OS==='android'} behavior="height"><ScrollView key={screen} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16,paddingBottom:36}}>
 {feedback}
 {screen==='edit'?<>
 <Pressable accessibilityRole="button" accessibilityState={{expanded:choice==='status',disabled:busy}} disabled={busy} onPress={()=>{Keyboard.dismiss();setChoice(choice==='status'?null:'status');}} style={{padding:16,minHeight:52,backgroundColor:theme.surface,borderRadius:10}}>{row(t('target'),statusLabel(target))}</Pressable>
 {choice==='status'?publicationStatuses.map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:target===value,disabled:busy}} disabled={busy} onPress={()=>{setTarget(value);setChoice(null);}} style={{padding:16,minHeight:52,borderColor:theme.border,borderBottomWidth:1}}><Text style={text}>{statusLabel(value)}</Text></Pressable>):null}
 {target==='sold'?<><Text style={secondary}>{t('amount')}</Text><TextInput accessibilityLabel={t('amount')} value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" inputAccessoryViewID={Platform.OS==='ios'?'publication-keyboard':undefined} maxLength={40} style={{...text,minHeight:48,padding:12,borderWidth:1,borderColor:theme.border,borderRadius:10,backgroundColor:theme.surface}} />
 <Pressable accessibilityRole="button" accessibilityState={{expanded:choice==='currency',disabled:busy}} disabled={busy} onPress={()=>{Keyboard.dismiss();setChoice(choice==='currency'?null:'currency');}} style={{padding:16,minHeight:52,backgroundColor:theme.surface,borderRadius:10}}>{row(t('currency'),currency)}</Pressable>
 {choice==='currency'?inventoryCurrencies.map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:currency===value,disabled:busy}} disabled={busy} onPress={()=>{setCurrency(value);setChoice(null);}} style={{padding:16,minHeight:52,borderBottomWidth:1,borderColor:theme.border}}><Text style={text}>{value}</Text></Pressable>):null}</>:null}
 <Text style={secondary}>{t('reason')}</Text><TextInput accessibilityLabel={t('reason')} value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={2000} style={{...text,minHeight:120,padding:12,textAlignVertical:'top',borderWidth:1,borderColor:theme.border,borderRadius:10,backgroundColor:theme.surface}} /><Text style={secondary}>{t('reasonHint')}</Text>{invalid?<Text accessibilityRole="alert" style={text}>{t('invalid')}</Text>:null}
 {button('change',changeStatus,busy)}
 </>:reviewed&&attributes?<>
 <Text style={text}>{t(reviewed.command.kind==='publish'?'publishHint':reviewed.command.kind==='unpublish'?'unpublishHint':'lifecycleHint')}</Text>
 {reviewed.command.kind==='publish'?<>
 <Text accessibilityRole="header" style={{...text,fontSize:22,fontWeight:'600'}}>{attributes.title||[attributes.make,attributes.model].filter(Boolean).join(' ')||attributes.stock_number}</Text>
 {(['stock_number','make','model','size','finish','description'] as const).map(field=>attributes[field]?row(i18n.t(`inventory.field.${field}`),attributes[field]!):null)}
 {(['form','condition'] as const).map(field=>row(i18n.t(`inventory.field.${field}`),attributes[field]?i18n.t(`inventory.${field}.${attributes[field]}` as MessageKey):i18n.t('inventory.edit.unknown')))}
 {(['featured','player_system'] as const).map(field=>row(i18n.t(`inventory.field.${field}`),i18n.t(attributes[field]?'inventory.edit.yes':'inventory.edit.no')))}
 {attributes.manufactured?(['year','month','day'] as const).map(field=>attributes.manufactured![field]?row(i18n.t(`inventory.field.${field}`),i18n.number(attributes.manufactured![field],{useGrouping:false})):null):null}
 {row(i18n.t('inventory.field.asking_amount'),attributes.price_visible&&attributes.asking_price?i18n.money(attributes.asking_price.minor_units,attributes.asking_price.currency):t('noPrice'))}
 {reviewed.state.photos.slice(page*6,page*6+6).map((photo,index)=><View key={photo.id} style={{gap:6}}><Text style={secondary}>{i18n.t('inventory.photos.number',{number:i18n.number(page*6+index+1)})}</Text><InventoryPhotoImage dealerID={dealerID} recordID={recordID} photoID={photo.id} alt={photo.altText||i18n.t('inventory.photos.number',{number:i18n.number(page*6+index+1)})} /></View>)}
 {!reviewed.state.photos.length?<Text style={secondary}>{t('noPhotos')}</Text>:null}
 {reviewed.state.photos.length>6?<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}><Button title={i18n.t('inventory.photos.previous')} color={theme.accent} disabled={page===0} onPress={()=>setPage(v=>v-1)} /><Button title={i18n.t('inventory.photos.next')} color={theme.accent} disabled={(page+1)*6>=reviewed.state.photos.length} onPress={()=>setPage(v=>v+1)} /></View>:null}
 </>:reviewed.command.kind==='transition'?<><Text style={text}>{statusLabel(reviewed.state.record.status)} → {statusLabel(reviewed.command.status)}</Text><Text style={secondary}>{t('privateSale')}</Text>{reviewed.command.salePrice?row(t('amount'),i18n.money(reviewed.command.salePrice.minor_units,reviewed.command.salePrice.currency)):null}{reviewed.command.reason?row(t('reason'),reviewed.command.reason):null}</>:null}
 </>:null}
 </ScrollView></KeyboardAvoidingView>
 {screen==='review'?<View style={{padding:16,borderTopWidth:1,borderColor:theme.border}}>{button('confirm',confirm,busy||!state?.review)}</View>:null}
 {Platform.OS==='ios'?<InputAccessoryView nativeID="publication-keyboard"><View style={{backgroundColor:theme.surface,alignItems:'flex-end'}}><Button title={i18n.t('inventory.edit.done')} color={theme.accent} onPress={Keyboard.dismiss} /></View></InputAccessoryView>:null}
 </SafeAreaView></Modal>
 </View>;
}
