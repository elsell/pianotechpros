import {useMemo} from 'react';
import {FlatList,Pressable,RefreshControl,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {createPublicResource} from '@pianotechpros/client-core';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {NativeButton} from '../../src/native-button';
import {usePublicState} from '../../src/showroom/public-read';
export default function PublicDirectory(){
 const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();const router=useRouter();
 const model=useMemo(()=>createPublicResource(signal=>createShowroomApiClient(apiURL).directory(signal)),[apiURL]);const state=usePublicState(model);
 return <FlatList data={state.value??[]} keyExtractor={shop=>shop.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20,gap:12,flexGrow:1}}
  refreshControl={<RefreshControl refreshing={state.loading} onRefresh={()=>void model.refresh()} tintColor={theme.accent}/>}
  ListHeaderComponent={<View style={{gap:12,marginBottom:20}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'600'}}>{i18n.t('showroom.title')}</Text><Text style={{color:theme.secondary,fontSize:17}}>{i18n.t('showroom.discovery.introduction')}</Text></View>}
  renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/showrooms/catalog',params:{slug:item.slug}})} style={({pressed})=>({minHeight:56,padding:20,borderRadius:12,backgroundColor:theme.surface,opacity:pressed?.6:1})}><Text style={{color:theme.accent,fontSize:20}}>{item.name}</Text></Pressable>}
  ListEmptyComponent={!state.loading?<Text accessibilityRole={state.failure?'alert':undefined} style={{color:theme.secondary,fontSize:17}}>{i18n.t(state.failure?'showroom.unavailable':'showroom.directoryEmpty')}</Text>:null}
  ListFooterComponent={state.failure?<NativeButton title={i18n.t('dealer.retry')} onPress={()=>void model.refresh()}/>:null}/>;
}
