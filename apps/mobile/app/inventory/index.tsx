import {NativeChoiceIndicator} from '../../src/native-choice-indicator';
import {NativeButton as Button} from '../../src/native-button';
import { useCallback, useEffect, useState } from 'react';
import {FlatList,Modal,Pressable,RefreshControl,ScrollView,Text,TextInput,View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { InventoryClientError } from '@pianotechpros/api-client';
import { createInventoryBrowser, inventoryBrowseStatuses, type InventoryBrowseStatus } from '@pianotechpros/client-core';
import type { MessageKey } from '@pianotechpros/i18n';
import { useMobileSession } from '../../src/session-provider';
import { useInventoryRequest } from '../../src/use-inventory-request';
import { useNativeTheme } from '../../src/native-theme';
import { usePullRefresh } from '../../src/use-pull-refresh';

type Row={id:string;title:string;stock:string;status:string;featured:boolean};
const statusKey=(value:string)=>`inventory.status.${value}` as MessageKey;
function Inventory({dealerID}:{dealerID:string}){
 const router=useRouter();const {i18n}=useMobileSession();const request=useInventoryRequest();const theme=useNativeTheme();
 const [search,setSearch]=useState('');const [filtersOpen,setFiltersOpen]=useState(false);
 const [browser]=useState(()=>createInventoryBrowser<Row>({copy:row=>({...row}),accessDenied:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status),list:async(filters,cursor)=>{
  const page=await request(api=>api.list(dealerID,{search:filters.search,status:filters.status==='all'||filters.status==='active'?undefined:filters.status,includeInactive:filters.status==='all',cursor}));
  return {...page,items:page.items.map(r=>({id:r.id,title:r.attributes.title||[r.attributes.make,r.attributes.model].filter(Boolean).join(' ')||r.attributes.stock_number,stock:r.attributes.stock_number,status:r.status,featured:!!r.attributes.featured}))};
 }}));
 const [state,setState]=useState(browser.snapshot());const pull=usePullRefresh(()=>browser.refresh());
 useEffect(()=>{if(state.denied)setFiltersOpen(false);},[state.denied]);
 useEffect(()=>{const unsubscribe=browser.subscribe(setState);return()=>{unsubscribe();browser.dispose();};},[browser]);
 useFocusEffect(useCallback(()=>{void browser.filter(browser.snapshot().filters);},[browser]));
 function apply(status:InventoryBrowseStatus,submittedSearch=search){setFiltersOpen(false);void browser.filter({search:submittedSearch,status});}
 return <><Stack.Screen options={{title:i18n.t('inventory.heading'),headerLargeTitle:true,headerRight:()=>state.denied?null:<Button title={i18n.t('inventory.edit.new')}  onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:'new',dealerID}})} />}} />
 <FlatList data={state.items} keyExtractor={item=>item.id} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,flexGrow:1}}
  refreshControl={state.denied?undefined:<RefreshControl refreshing={pull.refreshing} onRefresh={()=>{void pull.refresh();}} tintColor={theme.accent} />}
  ListHeaderComponent={state.denied?null:<View style={{gap:12,marginBottom:20}}>
   <Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.search')}</Text>
   <TextInput accessibilityLabel={i18n.t('inventory.search')} value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} maxLength={120} onSubmitEditing={({nativeEvent})=>{setSearch(nativeEvent.text);apply(state.filters.status,nativeEvent.text);}} style={{color:theme.text,backgroundColor:theme.surface,borderColor:theme.border,borderWidth:1,borderRadius:10,padding:12,minHeight:48,fontSize:17}} />
   <Button title={i18n.t('inventory.submitSearch')}  onPress={()=>apply(state.filters.status)} />
   <Button title={i18n.t('inventory.filterButton',{status:i18n.t(statusKey(state.filters.status))})}  onPress={()=>setFiltersOpen(true)} />
   <Button title={i18n.t('inventory.refresh')}  disabled={state.busy} onPress={()=>{void browser.refresh();}} />
  </View>}
  renderItem={({item})=><Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/inventory/[id]',params:{id:item.id,dealerID}})} style={{paddingVertical:16,borderBottomWidth:1,borderColor:theme.border,gap:5}}><Text style={{color:theme.text,fontSize:20,fontWeight:'600'}}>{item.title}</Text><Text style={{color:theme.secondary,fontSize:16}}>{i18n.t('inventory.stock',{number:item.stock})}</Text><Text style={{color:theme.text,fontSize:16}}>{i18n.t(statusKey(item.status))}</Text>{item.featured?<Text style={{color:theme.accent,fontSize:16}}>{i18n.t('inventory.featured')}</Text>:null}</Pressable>}
  ListEmptyComponent={!state.busy&&!state.failed?<Text style={{color:theme.secondary,fontSize:17}}>{i18n.t(state.filters.search||state.filters.status!=='active'?'inventory.noMatches':'inventory.empty')}</Text>:null}
  ListFooterComponent={<View style={{paddingVertical:20,gap:12}}>{state.busy?<Text accessibilityLiveRegion="polite" style={{color:theme.secondary}}>{i18n.t('common.loading')}</Text>:null}{state.failed?<><Text accessibilityRole="alert" style={{color:theme.text}}>{i18n.t(state.denied?'inventory.denied':'inventory.loadFailed')}</Text><Button title={i18n.t('inventory.retry')}  onPress={()=>{void browser.retry();}} /></>:null}{state.nextCursor?<Button title={i18n.t('inventory.more')}  disabled={state.busy} onPress={()=>{void browser.more();}} />:null}</View>}/>
 <Modal visible={filtersOpen&&!state.denied} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setFiltersOpen(false)}><SafeAreaView style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:20,gap:8}}><Text accessibilityRole="header" style={{fontSize:24,fontWeight:'600',color:theme.text,marginBottom:16}}>{i18n.t('inventory.chooseStatus')}</Text>{inventoryBrowseStatuses.map(status=><Pressable key={status} accessibilityRole="radio" accessibilityState={{checked:state.filters.status===status}} onPress={()=>apply(status)} style={({pressed})=>({flexDirection:'row',alignItems:'center',minHeight:52,padding:16,backgroundColor:theme.surface,borderWidth:state.filters.status===status?2:1,borderColor:state.filters.status===status?theme.accent:theme.border,borderRadius:10,opacity:pressed?.65:1})}><NativeChoiceIndicator checked={state.filters.status===status}/><Text style={{color:theme.text,fontSize:18,flex:1}}>{i18n.t(statusKey(status))}</Text></Pressable>)}<Button title={i18n.t('inventory.closeFilters')}  onPress={()=>setFiltersOpen(false)} /></ScrollView></SafeAreaView></Modal>
 </>;
}
export default function InventoryScreen(){
 const {dealerID}=useLocalSearchParams<{dealerID:string}>();const auth=useMobileSession();const theme=useNativeTheme();
 if(!auth.ready)return <View style={{padding:20}}><Text style={{color:theme.text}}>{auth.i18n.t('common.loading')}</Text></View>;
 if(!auth.session||!auth.profile||typeof dealerID!=='string')return <Redirect href="/" />;
 return <Inventory key={JSON.stringify([auth.profile.id,dealerID])} dealerID={dealerID} />;
}
