import {NativeButton as Button} from '../native-button';
import {useEffect,useRef,useState} from 'react';
import {AppState,Modal,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {InventoryClientError,type InventoryHistoryEntry} from '@pianotechpros/api-client';
import {createInventoryHistory,type InventoryHistoryState} from '@pianotechpros/client-core';
import {inventoryHistoryFieldKey,type MessageKey} from '@pianotechpros/i18n';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {useInventoryHistoryRequest} from '../use-inventory-request';
export function InventoryHistory({userID,dealerID,recordID}:{userID:string;dealerID:string;recordID:string}){
 const {i18n}=useMobileSession();const theme=useNativeTheme();const request=useInventoryHistoryRequest();
 const [open,setOpen]=useState(false);const [state,setState]=useState<InventoryHistoryState<InventoryHistoryEntry>>({items:[],busy:false,issue:null,operation:'latest',loaded:false});
 const model=useRef<ReturnType<typeof createInventoryHistory<InventoryHistoryEntry>>|null>(null);const scroll=useRef<ScrollView>(null);
 const message=(key:string)=>i18n.t(key as MessageKey);
 function close(){model.current?.dispose();model.current=null;setOpen(false);}
 useEffect(()=>{
  if(!open)return;
  const current=createInventoryHistory<InventoryHistoryEntry>({list:(cursor,signal)=>request(api=>api.list(dealerID,recordID,cursor,signal)),classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='protocol_error'?'protocol_error':'unavailable'});
  model.current=current;const unsubscribe=current.subscribe(setState);void current.latest();
  const background=AppState.addEventListener('change',value=>{if(value!=='active')close();});
  return()=>{background.remove();unsubscribe();current.dispose();if(model.current===current)model.current=null;};
 },[open,userID,dealerID,recordID,request]);
 async function page(operation:'latest'|'older'|'retry'){const current=model.current;await current?.[operation]();if(model.current===current)scroll.current?.scrollTo({y:0,animated:true});}
 const copy={color:theme.text,fontSize:17};const secondary={color:theme.secondary,fontSize:15};
 const row=(label:string,value:string)=><View key={label} style={{gap:4}}><Text style={secondary}>{label}</Text><Text style={copy} selectable>{value}</Text></View>;
 return <View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:16}}><Button title={i18n.t('history.open')}  onPress={()=>setOpen(true)}/>
 <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
 <View style={{padding:16,gap:12,borderBottomWidth:1,borderColor:theme.border}}><Button title={i18n.t('history.close')}  onPress={close}/><Text accessibilityRole="header" style={{...copy,fontSize:28,fontWeight:'600'}}>{i18n.t('history.title')}</Text></View>
 <ScrollView ref={scroll} contentContainerStyle={{padding:20,gap:20}}><Text style={secondary}>{i18n.t('history.savedOnly')}</Text>
 {state.busy?<Text accessibilityLiveRegion="polite" style={copy}>{i18n.t('common.loading')}</Text>:null}
 {state.issue?<View style={{gap:12}}><Text accessibilityRole="alert" style={copy}>{i18n.t(state.issue==='denied'?'inventory.denied':'history.failed')}</Text>{state.issue!=='denied'?<Button title={i18n.t('inventory.retry')}  disabled={state.busy} onPress={()=>void page('retry')}/>:null}</View>:null}
 {state.loaded&&!state.items.length?<Text style={copy}>{i18n.t('history.empty')}</Text>:null}
 {state.items.map(entry=><View key={entry.revision} style={{gap:12,paddingBottom:20,borderBottomWidth:1,borderColor:theme.border}}>
 <Text accessibilityRole="header" style={{...copy,fontSize:21,fontWeight:'600'}}>{message(`history.kind.${entry.kind}`)}</Text><Text style={secondary}>{i18n.t('history.revision',{number:i18n.number(entry.revision)})}</Text><Text style={secondary}>{i18n.date(new Date(entry.occurred_at),{dateStyle:'medium',timeStyle:'short'})}</Text>
 {row(i18n.t('history.actor'),entry.actor_id===userID?i18n.t('history.you'):i18n.t('history.account',{id:entry.actor_id}))}
 {row(i18n.t('history.origin'),message(`history.source.${entry.source}`))}
 {entry.from?row(i18n.t('history.from'),message(`inventory.status.${entry.from}`)):null}{entry.to?row(i18n.t('history.to'),message(`inventory.status.${entry.to}`)):null}
 {entry.sale_price?row(i18n.t('history.field.sale_price'),i18n.money(entry.sale_price.minor_units,entry.sale_price.currency)):null}{entry.reason?row(i18n.t('history.reason'),entry.reason):null}
 {entry.fields.map(field=><Text key={field} style={copy}>{entry.kind==='attributes'?i18n.t('history.fieldOrigin',{field:i18n.t(inventoryHistoryFieldKey(field)),origin:message(`history.source.${entry.field_sources?.[field]??'unknown'}`)}):i18n.t(inventoryHistoryFieldKey(field))}</Text>)}
 </View>)}
 {state.issue!=='denied'?<View style={{gap:16}}><Button title={i18n.t('history.latest')}  disabled={state.busy} onPress={()=>void page('latest')}/>{state.nextCursor?<Button title={i18n.t('history.older')}  disabled={state.busy} onPress={()=>void page('older')}/>:null}</View>:null}
 </ScrollView></SafeAreaView></SafeAreaProvider></Modal></View>;
}
