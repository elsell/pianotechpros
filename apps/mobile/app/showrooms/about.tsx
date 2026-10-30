import {useMemo} from 'react';
import {RefreshControl,ScrollView,Text} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {createPublicResource} from '@pianotechpros/client-core';
import {NativeButton} from '../../src/native-button';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {usePublicState} from '../../src/showroom/public-read';
import {ShowroomDetails} from '../../src/showroom/ShowroomDetails';
export default function AboutShowroom(){
 const params=useLocalSearchParams<{slug:string}>();const slug=typeof params.slug==='string'?params.slug:'';const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();
 const model=useMemo(()=>createPublicResource(async signal=>(await createShowroomApiClient(apiURL).list(slug,{limit:1},signal)).profile),[apiURL,slug]);const state=usePublicState(model);
 return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20,gap:20}} refreshControl={<RefreshControl refreshing={state.loading} onRefresh={()=>void model.refresh()} tintColor={theme.accent}/>}>
 {state.value?<ShowroomDetails key={state.value.slug} profile={state.value}/>:state.failure?<><Text accessibilityRole="alert" style={{color:theme.text,fontSize:17}}>{i18n.t('showroom.unavailable')}</Text><NativeButton title={i18n.t('dealer.retry')} onPress={()=>void model.refresh()}/></>:null}
 </ScrollView>;
}
