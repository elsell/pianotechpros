import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Image,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {randomUUID} from 'expo-crypto';
import {InventoryClientError} from '@pianotechpros/api-client';
import {createInventoryPhotoWorkspace,createNativePhotoPicker,createNativePickerSession,photoPreviewURI,type InventoryFormWorkspace,type InventoryCaptureWorkspace} from '@pianotechpros/client-core';
import type {MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {useInventoryPhotoRequest,useInventoryRequest} from '../use-inventory-request';
import {claimMobileInventoryPhotos} from './capture-lease';
import {openMobileInventoryRecovery} from './recovery-storage';
import {claimMobilePhotoPicker,discardMobilePhoto,launchMobilePhoto,mobilePhotoDigest,mobilePickerOwner,pendingMobilePhoto,prepareMobilePhoto} from './photo-media';
import {PhotoInspection} from './PhotoInspection';
type Photos=ReturnType<typeof createInventoryPhotoWorkspace>;
type PickerSession=ReturnType<typeof createNativePickerSession>;
export function InventoryPhotoImage({dealerID,recordID,photoID,alt,inspect=false}:{dealerID:string;recordID:string;photoID:string;alt:string;inspect?:boolean}){
 const request=useInventoryPhotoRequest();const {i18n}=useMobileSession();const theme=useNativeTheme();
 const [uri,setURI]=useState<string|null>(null);const [failed,setFailed]=useState(false);const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setURI(null);setFailed(false);void request(api=>api.image(dealerID,recordID,photoID)).then(bytes=>{if(active)setURI(photoPreviewURI(bytes));}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[dealerID,recordID,photoID,request,attempt]);
 if(uri&&inspect)return <PhotoInspection uri={uri} alt={alt} onError={()=>{setURI(null);setFailed(true);}} />;
 return uri?<Image source={{uri}} accessibilityLabel={alt} accessible={!!alt} resizeMode="contain" style={{width:'100%',height:240}} onError={()=>{setURI(null);setFailed(true);}} />:<View style={{height:120,justifyContent:'center'}}><Text style={{color:theme.secondary}}>{i18n.t(failed?'inventory.photos.imageFailed':'common.loading')}</Text>{failed?<Button title={i18n.t('inventory.photos.retryImage')} onPress={()=>setAttempt(v=>v+1)} />:null}</View>;
}
export function InventoryPhotos({workspace,userID,dealerID,onBusy,otherBusy=false}:{workspace:InventoryFormWorkspace;userID:string;dealerID:string;onBusy:(busy:boolean)=>void;otherBusy?:boolean}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const request=useInventoryPhotoRequest();const inventory=useInventoryRequest();
 const model=useRef<{photos:Photos;picker:PickerSession;active():boolean}|null>(null);
 const [state,setState]=useState<ReturnType<Photos['snapshot']>|null>(null);const [pickerView,setPickerView]=useState<ReturnType<PickerSession['snapshot']>>({state:{status:'idle'},held:false,busy:false,error:null});const pickerState=pickerView.state;
 const [working,setWorking]=useState(false);const operation=useRef(false);const [error,setError]=useState<MessageKey|null>(null);const [page,setPage]=useState(0);const [preview,setPreview]=useState<string|null>(null);const [alt,setAlt]=useState('');const [inspecting,setInspecting]=useState(true);
 useEffect(()=>{
  let alive=true;
  const active=()=>alive&&!!workspace.snapshot().draft;
  const capture='pickerTarget' in workspace?workspace as InventoryCaptureWorkspace:null;
  const photos=createInventoryPhotoWorkspace({capture:capture?{stage:bytes=>capture.stagePhoto(bytes),pending:()=>capture.pendingPhoto(),expired:()=>capture.expiredPhoto(),discard:()=>capture.discardPhoto()}:undefined,userID,dealerID,active,recordID:()=>workspace.recordID(),ensureRecord:()=>capture?capture.ensureRecord():Promise.resolve(workspace.recordID()||null),withMediaMutation:work=>workspace.withMediaMutation(work),now:Date.now,key:randomUUID,lease:id=>claimMobileInventoryPhotos(userID,dealerID,id),storage:()=>openMobileInventoryRecovery(userID),sha256:mobilePhotoDigest,
   classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='conflict'?'conflict':error instanceof InventoryClientError&&[400,413,422].includes(error.status)?'rejected':'uncertain',
   list:id=>request(api=>api.list(dealerID,id)),upload:(id,bytes,key,revision)=>request(api=>api.upload(dealerID,id,bytes,key,revision)),reorder:(id,ids,revision)=>request(api=>api.reorder(dealerID,id,ids,revision)),describe:(id,photoID,altText,revision)=>request(api=>api.describe(dealerID,id,photoID,altText,revision)),remove:(id,photoID,revision)=>request(api=>api.remove(dealerID,id,photoID,revision)),
  });
  const picker=createNativePickerSession({active,bind:async()=>{
   const binding=capture?await capture.pickerTarget():await workspace.protect()?{id:`record/${workspace.recordID()}`,release:()=>{}}:null;
   if(!binding||!active()){binding?.release();throw new Error('native_picker_unavailable');}
   try{
    const broker=createNativePhotoPicker({scope:{userID,dealerID,targetID:binding.id},active,now:Date.now,key:randomUUID,owner:mobilePickerOwner,lease:claimMobilePhotoPicker,storage:()=>openMobileInventoryRecovery(userID),
     authorize:async()=>{const id=workspace.recordID();if(id)await inventory(api=>api.get(dealerID,id));else await inventory(api=>api.list(dealerID,{limit:1}));},pending:pendingMobilePhoto,launch:source=>launchMobilePhoto(source,active),discard:discardMobilePhoto,
     accept:async asset=>{const bytes=await prepareMobilePhoto(asset,active);if(!active())throw new Error('native_picker_inactive');await photos.add(bytes);},
    });return {picker:broker,release:binding.release};
   }catch(error){binding.release();throw error;}
  }});
  const current={photos,picker,active};model.current=current;const unsubscribe=photos.subscribe(setState);const unpick=picker.subscribe(setPickerView);
  operation.current=true;setWorking(true);
  void (async()=>{try{await picker.restore();if(active())await photos.refresh();}catch{if(active())setError('inventory.photos.failed');}finally{if(alive){operation.current=false;setWorking(false);}}})();
  return()=>{alive=false;unsubscribe();unpick();void picker.dispose().then(()=>photos.dispose());if(model.current===current)model.current=null;};
 },[workspace,userID,dealerID,request,inventory]);
 const held=pickerView.held;const ownBusy=working||pickerView.busy||!!state?.busy;const busy=ownBusy||otherBusy;
 const pickerError:MessageKey|null=pickerView.error==='other_target'?'inventory.photos.pickerOtherTarget':pickerView.error?'inventory.photos.failed':null;
 useEffect(()=>{onBusy(ownBusy||held);return()=>onBusy(false);},[ownBusy,held,onBusy]);
 useEffect(()=>{if(state&&page>0&&page*6>=state.photos.length)setPage(Math.max(0,Math.ceil(state.photos.length/6)-1));},[state,page]);
 async function run(work:(current:NonNullable<typeof model.current>)=>Promise<void>){const current=model.current;if(!current||operation.current||otherBusy||!current.active())return;operation.current=true;setWorking(true);setError(null);try{await work(current);}catch(failure){if(current.active())setError(failure instanceof Error&&failure.message==='native_picker_other_target'?'inventory.photos.pickerOtherTarget':'inventory.photos.failed');}finally{if(current.active()){operation.current=false;setWorking(false);}}}
 function choose(source:'camera'|'library'){void run(current=>current.picker.select(source));}
 function discard(){Alert.alert(i18n.t('inventory.photos.pickerDiscard'),i18n.t('inventory.photos.pickerDiscardHint'),[{text:i18n.t('inventory.photos.cancel'),style:'cancel'},{text:i18n.t('inventory.photos.pickerDiscard'),style:'destructive',onPress:()=>{void run(current=>current.picker.discard());}}]);}
 const text={color:theme.text,fontSize:17};const button=(key:MessageKey,action:()=>void,disabled=busy)=><Button title={i18n.t(key)} color={theme.accent} disabled={disabled} onPress={action} />;
 function remove(photoID:string){Alert.alert(i18n.t('inventory.photos.removeTitle'),i18n.t('inventory.photos.removeHint'),[{text:i18n.t('inventory.photos.cancel'),style:'cancel'},{text:i18n.t('inventory.photos.remove'),style:'destructive',onPress:()=>{void run(async current=>{await current.photos.remove(photoID);if(current.active())setPreview(null);});}}]);}
 const selected=state?.photos.find(p=>p.id===preview);
 return <View style={{gap:12}}>
 <Text accessibilityRole="header" style={{...text,fontSize:22,fontWeight:'600'}}>{i18n.t('inventory.photos.heading')}</Text><Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.photos.nativeHint')}</Text>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{button('inventory.photos.camera',()=>choose('camera'),busy||held||!!state?.denied)}{button('inventory.photos.library',()=>choose('library'),busy||held||!!state?.denied)}</View>
 {busy?<Text accessibilityLiveRegion="polite" style={text}>{i18n.t('inventory.photos.busy')}</Text>:null}
 {error||pickerError||state?.failure||state?.denied?<Text accessibilityRole="alert" style={text}>{i18n.t(state?.denied?'inventory.denied':error??pickerError??(state?.failure==='conflict'?'inventory.photos.conflict':'inventory.photos.failed'))}</Text>:null}
 {pickerState.status==='denied'?<Text style={text}>{i18n.t('inventory.photos.permissionDenied')}</Text>:null}
 {held||pickerError?<View style={{gap:8}}><Text style={text}>{i18n.t(pickerState.status==='selected'?'inventory.photos.pickerSelected':pickerState.status==='waiting'?'inventory.photos.pickerWaiting':pickerState.status==='expired'?'inventory.photos.expired':'inventory.photos.pickerUncertain')}</Text>
 {pickerState.status==='selected'?button('inventory.photos.pickerAdd',()=>{void run(current=>current.picker.consume());}):button('inventory.photos.pickerResume',()=>{void run(current=>current.picker.restore());})}
 {button('inventory.photos.pickerDiscard',discard)}</View>:null}
 {state?.expiredSelections?<Text style={text}>{i18n.t('inventory.photos.expired')}</Text>:null}{state?.uncertainExpirations?<Text style={text}>{i18n.t('inventory.photos.expiredUncertain')}</Text>:null}
 {!state?.photos.length&&!busy?<Text style={{color:theme.secondary}}>{i18n.t('inventory.photos.empty')}</Text>:null}
 {state?.photos.slice(page*6,page*6+6).map((photo,index)=><Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={i18n.t('inventory.photos.preview',{number:i18n.number(page*6+index+1)})} onPress={()=>{setAlt(photo.altText);setInspecting(true);setPreview(photo.id);}} style={{backgroundColor:theme.surface,borderRadius:12,padding:12,gap:8}}><InventoryPhotoImage dealerID={dealerID} recordID={workspace.recordID()} photoID={photo.id} alt={photo.altText} /><Text style={text}>{i18n.t('inventory.photos.number',{number:i18n.number(page*6+index+1)})}</Text>{page===0&&index===0?<Text style={{color:theme.accent}}>{i18n.t('inventory.photos.cover')}</Text>:null}</Pressable>)}
 {state&&state.photos.length>6?<View style={{flexDirection:'row',justifyContent:'space-between'}}>{button('inventory.photos.previous',()=>setPage(v=>v-1),page===0)}{button('inventory.photos.next',()=>setPage(v=>v+1),(page+1)*6>=state.photos.length)}</View>:null}
 {button('inventory.photos.refresh',()=>{void run(async current=>{await current.photos.refresh();});})}
 {state?.capturePending?<View><Text style={text}>{i18n.t('inventory.photos.capturePending')}</Text>{button('inventory.photos.retry',()=>{void run(current=>current.photos.retryCapture());})}{button('inventory.photos.discard',()=>{void run(current=>current.photos.discardCapture());})}</View>:null}
 {state?.entries.map(entry=><View key={entry.id} style={{padding:12,gap:8,backgroundColor:theme.surface}}><Text style={text}>{i18n.t(entry.state==='conflict'?'inventory.photos.uploadConflict':entry.state==='acknowledged'||entry.state==='removing'?'inventory.photos.cleanup':`inventory.photos.${entry.state}` as MessageKey)}</Text>
 {entry.state!=='rejected'?button(entry.state==='conflict'?'inventory.photos.rebase':entry.state==='acknowledged'||entry.state==='removing'?'inventory.photos.cleanupAction':'inventory.photos.retry',()=>{void run(current=>entry.state==='conflict'?current.photos.rebase(entry.id):current.photos.retry(entry.id));}):null}
 {['reserved','ready','conflict','rejected'].includes(entry.state)?button('inventory.photos.discard',()=>{void run(current=>current.photos.discard(entry.id));}):null}</View>)}
 <Modal visible={!!selected} presentationStyle="fullScreen" animationType="slide" onRequestClose={()=>setPreview(null)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
 {inspecting&&selected?<View style={{flex:1,padding:12,gap:12}}><View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{button('inventory.photos.close',()=>setPreview(null),false)}{button('inventory.photos.details',()=>setInspecting(false))}</View><InventoryPhotoImage inspect dealerID={dealerID} recordID={workspace.recordID()} photoID={selected.id} alt={selected.altText} /></View>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
 {selected?<>{button('inventory.photos.inspect',()=>setInspecting(true))}<InventoryPhotoImage dealerID={dealerID} recordID={workspace.recordID()} photoID={selected.id} alt={selected.altText} /><Text accessibilityRole="header" style={text}>{i18n.t('inventory.photos.alt')}</Text><Text style={{color:theme.secondary}}>{i18n.t('inventory.photos.altHint')}</Text><TextInput accessibilityLabel={i18n.t('inventory.photos.alt')} multiline maxLength={480} value={alt} onChangeText={setAlt} style={{...text,minHeight:100,padding:12,borderColor:theme.border,borderWidth:1,borderRadius:10}} />
 {button('inventory.photos.saveAlt',()=>{void run(current=>current.photos.describe(selected.id,alt));},busy||[...alt.trim()].length>240)}
 {button('inventory.photos.makeCover',()=>{void run(current=>current.photos.cover(selected.id));},busy||state?.photos[0]?.id===selected.id)}
 {button('inventory.photos.earlier',()=>{void run(current=>current.photos.move(selected.id,-1));},busy||state?.photos[0]?.id===selected.id)}
 {button('inventory.photos.later',()=>{void run(current=>current.photos.move(selected.id,1));},busy||state?.photos.at(-1)?.id===selected.id)}
 {button('inventory.photos.remove',()=>remove(selected.id))}
 {error||state?.failure?<Text accessibilityRole="alert" style={text}>{i18n.t(error??'inventory.photos.failed')}</Text>:null}</>:null}{button('inventory.photos.close',()=>setPreview(null),false)}
 </ScrollView>}</SafeAreaView></Modal>
 </View>;
}
