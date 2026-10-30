import {useCallback,useEffect,useMemo,useState} from 'react';
import {FlatList,Keyboard,RefreshControl,Text,TextInput,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {createShowroomBrowser,showroomFilterControlsVisible} from '@pianotechpros/client-core';
import {NativeButton} from '../../src/native-button';
import {useMobileSession} from '../../src/session-provider';
import {useNativeTheme} from '../../src/native-theme';
import {usePublicState} from '../../src/showroom/public-read';
import {PublicFilters} from '../../src/showroom/Filters';
import {PianoCard} from '../../src/showroom/PianoCard';
import {PublicImage} from '../../src/showroom/PublicImage';
export default function PublicCatalog(){
 const params=useLocalSearchParams<{slug:string}>();const slug=typeof params.slug==='string'?params.slug:'';
 const {apiURL,i18n}=useMobileSession();const theme=useNativeTheme();const router=useRouter();const [search,setSearch]=useState(''),[filters,setFilters]=useState(false);
 useEffect(()=>{setSearch('');setFilters(false);},[slug]);
 useFocusEffect(useCallback(()=>()=>{setFilters(false);Keyboard.dismiss();},[]));
 const model=useMemo(()=>createShowroomBrowser(slug,i18n.locale==='es'?',':'.',(query,signal)=>createShowroomApiClient(apiURL).list(slug,query,signal)),[apiURL,slug,i18n.locale]);
 const state=usePublicState(model),profile=state.value?.profile;
 const showControls=showroomFilterControlsVisible(state.fields,state.value?.pianos.length??0,!!state.value?.nextCursor,search)||state.invalid;
 return <View style={{flex:1}}><FlatList initialNumToRender={3} maxToRenderPerBatch={3} windowSize={3} data={state.value?.pianos??[]} keyExtractor={piano=>piano.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20,flexGrow:1}}
 refreshControl={<RefreshControl refreshing={state.loading} onRefresh={()=>void model.refresh()} tintColor={theme.accent}/>}
 ListHeaderComponent={<View style={{gap:16,marginBottom:20}}>{profile?<>{profile.banner?<PublicImage slug={slug} photoID={profile.banner.id} alt={profile.banner_alt_text}/>:null}<Text accessibilityRole="header" style={{color:theme.text,fontSize:30,fontWeight:'600'}}>{profile.name}</Text>{profile.tagline?<Text style={{color:theme.secondary,fontSize:18}}>{profile.tagline}</Text>:null}</>:null}
 {profile?<NativeButton title={i18n.t('showroom.about')} onPress={()=>{Keyboard.dismiss();router.push({pathname:'/showrooms/about',params:{slug}});}}/>:null}
 {showControls?<><TextInput accessibilityLabel={i18n.t('showroom.search')} placeholder={i18n.t('showroom.search')} placeholderTextColor={theme.secondary} value={search} onChangeText={setSearch} maxLength={240} returnKeyType="search" onSubmitEditing={({nativeEvent})=>{setSearch(nativeEvent.text);Keyboard.dismiss();void model.filter({...state.fields,search:nativeEvent.text});}} style={{color:theme.text,fontSize:17,minHeight:52,padding:12,borderWidth:1,borderColor:theme.border,borderRadius:12}}/>
 <NativeButton title={i18n.t('showroom.filters')} onPress={()=>{Keyboard.dismiss();setFilters(true);}}/></>:profile?<NativeButton title={i18n.t('showroom.all')} onPress={()=>void model.filter({...state.fields,availability:'all'})}/>:null}
 {state.invalid||state.failure?<Text accessibilityRole="alert" style={{color:theme.text,fontSize:17}}>{i18n.t(state.invalid?'showroom.invalidFilters':'showroom.unavailable')}</Text>:null}</View>}
 renderItem={({item})=><PianoCard slug={slug} piano={item} open={()=>router.push({pathname:'/showrooms/listing',params:{slug,id:item.id}})}/>}
 ListEmptyComponent={!state.loading&&!state.failure&&!state.invalid?<Text style={{color:theme.secondary,fontSize:17}}>{i18n.t('showroom.empty')}</Text>:null}
 ListFooterComponent={<View style={{gap:12}}>{state.failure?<NativeButton title={i18n.t('dealer.retry')} onPress={()=>void model.refresh()}/>:null}{state.value?.nextCursor?<NativeButton title={i18n.t('showroom.next')} disabled={state.loading} onPress={()=>void model.more()}/>:null}</View>}/>
 {filters?<PublicFilters initial={{...state.fields,search}} close={()=>setFilters(false)} apply={fields=>{setFilters(false);setSearch(fields.search??'');void model.filter(fields);}}/>:null}
 </View>;
}
