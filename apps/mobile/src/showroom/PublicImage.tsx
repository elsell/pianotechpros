import {useEffect,useMemo,useState} from 'react';
import {Image,Modal,Text,View} from 'react-native';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {createPublicResource,photoPreviewURI} from '@pianotechpros/client-core';
import {SafeAreaView} from 'react-native-safe-area-context';
import {PhotoInspection} from '../inventory/PhotoInspection';
import {NativeButton} from '../native-button';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {usePublicState} from './public-read';
export function PublicImage({slug,pianoID,photoID,alt,previewLabel}:{slug:string;pianoID?:string;photoID:string;alt:string;previewLabel?:string}){
 const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();
 const model=useMemo(()=>createPublicResource(async(signal)=>{
  const api=createShowroomApiClient(apiURL);
  const bytes=await (pianoID?api.photo(slug,pianoID,photoID,signal):api.banner(slug,photoID,signal));
  return photoPreviewURI(bytes);
 }),[apiURL,slug,pianoID,photoID]);
 const state=usePublicState(model);const [preview,setPreview]=useState(false);useEffect(()=>{setPreview(false);return model.subscribe(current=>{if(current.value===null)setPreview(false);});},[model]);const [decodeFailed,setDecodeFailed]=useState(false);useEffect(()=>setDecodeFailed(false),[model,state.value]);const failed=state.failure||!!state.value&&decodeFailed;
 return <><View style={{minHeight:180}}>{state.value&&!failed?<Image source={{uri:state.value}} accessibilityRole="image" accessibilityLabel={alt} accessible={!!alt} resizeMode="contain" resizeMethod="resize" style={{width:'100%',height:240}} onError={()=>setDecodeFailed(true)}/>:<Text style={{color:theme.secondary}}>{i18n.t(failed?'inventory.photos.imageFailed':'common.loading')}</Text>}{failed?<NativeButton title={i18n.t('inventory.photos.retryImage')} onPress={()=>{setDecodeFailed(false);void model.refresh();}}/>:null}{previewLabel&&state.value&&!failed?<NativeButton title={previewLabel} onPress={()=>setPreview(true)}/>:null}</View>
 {preview&&state.value&&!failed?<Modal visible presentationStyle="fullScreen" supportedOrientations={['portrait','landscape-left','landscape-right']} animationType="slide" onRequestClose={()=>setPreview(false)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><View style={{flex:1,padding:12,gap:12}}><NativeButton title={i18n.t('inventory.photos.close')} onPress={()=>setPreview(false)}/><PhotoInspection uri={state.value} alt={alt} onError={()=>{setPreview(false);setDecodeFailed(true);}}/></View></SafeAreaView></Modal>:null}</>;
}
