import {NativeButton as Button} from '../native-button';
import {useEffect,useRef,useState} from 'react';
import {AppState,Modal,PixelRatio,ScrollView,Share,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {InventoryClientError} from '@pianotechpros/api-client';
import {createInventoryScanLabel,type ScanLabelState} from '@pianotechpros/client-core';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {useInventoryScanRequest} from '../use-inventory-request';
export function InventoryScanLabel({dealerID,recordID,stock,title}:{dealerID:string;recordID:string;stock:string;title:string}){
 const {i18n,webURL}=useMobileSession();const theme=useNativeTheme();const request=useInventoryScanRequest();
 const [saved,setSaved]=useState<{stock:string;title:string}|null>(null);const [shareFailed,setShareFailed]=useState(false);
 const [state,setState]=useState<ScanLabelState>({busy:false,issue:null,value:null});
 const model=useRef<ReturnType<typeof createInventoryScanLabel>|null>(null);
 function close(){model.current?.dispose();model.current=null;setSaved(null);setState({busy:false,issue:null,value:null});setShareFailed(false);}
 useEffect(()=>{
  if(!saved)return;
  const current=createInventoryScanLabel({origin:webURL,dealerID,load:signal=>request(api=>api.ensure(dealerID,recordID,signal)),classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':'unavailable'});
  model.current=current;const unsubscribe=current.subscribe(setState);void current.load();
  const background=AppState.addEventListener('change',value=>{if(value!=='active')close();});
  return()=>{background.remove();unsubscribe();current.dispose();if(model.current===current)model.current=null;};
 },[saved,dealerID,recordID,webURL,request]);
 async function share(){const current=model.current;const link=state.value?.link;if(!current||!link)return;setShareFailed(false);try{await Share.share({message:link});}catch{if(model.current===current)setShareFailed(true);}}
 const {width}=useWindowDimensions();const modules=state.value?.matrix.length??1;const unit=Math.max(1,Math.floor(Math.min(width-40,340)*PixelRatio.get()/modules))/PixelRatio.get();
 const copy={color:theme.text,fontSize:17};
 return <View style={{borderTopWidth:1,borderColor:theme.border,paddingTop:16}}><Button title={i18n.t('scan.label.open')}  onPress={()=>setSaved({stock,title})}/>
 <Modal visible={saved!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
 <View style={{padding:16,gap:12,borderBottomWidth:1,borderColor:theme.border}}><Button title={i18n.t('scan.label.close')}  onPress={close}/><Text accessibilityRole="header" style={{...copy,fontSize:28,fontWeight:'600'}}>{i18n.t('scan.label.title')}</Text></View>
 <ScrollView contentContainerStyle={{padding:20,gap:20}}>
 {state.busy?<Text accessibilityLiveRegion="polite" style={copy}>{i18n.t('common.loading')}</Text>:null}
 {state.issue?<View style={{gap:12}}><Text accessibilityRole="alert" style={copy}>{i18n.t(state.issue==='denied'?'inventory.denied':'scan.label.failed')}</Text>{state.issue!=='denied'?<Button title={i18n.t('inventory.retry')}  onPress={()=>void model.current?.load()}/>:null}</View>:null}
 {state.value?<><Text accessibilityRole="header" style={{...copy,fontSize:24,fontWeight:'600'}}>{saved?.title}</Text><Text style={copy}>{saved?.stock}</Text>
 <View accessible accessibilityRole="image" accessibilityLabel={i18n.t('scan.label.image')} style={{width:modules*unit,height:modules*unit,alignSelf:'center',backgroundColor:'white'}}>
 {state.value.matrix.map((row,y)=><View key={y} style={{height:unit,flexDirection:'row'}}>{row.map((dark,x)=><View key={x} style={{width:unit,height:unit,backgroundColor:dark?'black':'white'}}/>)}</View>)}
 </View><Text style={copy}>{i18n.t('scan.label.signIn')}</Text><Text style={{color:theme.secondary,fontSize:15}}>{i18n.t('scan.label.saved')}</Text><Button title={i18n.t('scan.label.share')}  onPress={()=>void share()}/></>:null}
 {shareFailed?<Text accessibilityRole="alert" style={copy}>{i18n.t('scan.label.shareFailed')}</Text>:null}
 </ScrollView></SafeAreaView></SafeAreaProvider></Modal></View>;
}
