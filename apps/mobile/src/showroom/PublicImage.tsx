import {useEffect,useMemo,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {createPublicResource,photoPreviewURI} from '@pianotechpros/client-core';
import {NativeButton} from '../native-button';
import {useMobileSession} from '../session-provider';
import {useNativeTheme} from '../native-theme';
import {usePublicState} from './public-read';
export function PublicImage({slug,pianoID,photoID,alt}:{slug:string;pianoID?:string;photoID:string;alt:string}){
 const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();
 const model=useMemo(()=>createPublicResource(async(signal)=>{
  const api=createShowroomApiClient(apiURL);
  const bytes=await (pianoID?api.photo(slug,pianoID,photoID,signal):api.banner(slug,photoID,signal));
  return photoPreviewURI(bytes);
 }),[apiURL,slug,pianoID,photoID]);
 const state=usePublicState(model);const [decodeFailed,setDecodeFailed]=useState(false);useEffect(()=>setDecodeFailed(false),[model,state.value]);const failed=state.failure||!!state.value&&decodeFailed;
 return <View style={{minHeight:180}}>{state.value&&!failed?<Image source={{uri:state.value}} accessibilityRole="image" accessibilityLabel={alt} accessible={!!alt} resizeMode="contain" resizeMethod="resize" style={{width:'100%',height:240}} onError={()=>setDecodeFailed(true)}/>:<Text style={{color:theme.secondary}}>{i18n.t(failed?'inventory.photos.imageFailed':'common.loading')}</Text>}{failed?<NativeButton title={i18n.t('inventory.photos.retryImage')} onPress={()=>{setDecodeFailed(false);void model.refresh();}}/>:null}</View>;
}
