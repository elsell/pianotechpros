import {NativeButton as Button} from '../src/native-button';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {FlatList,Platform,Pressable,RefreshControl,ScrollView,Text,View} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { createDealerDirectory } from '@pianotechpros/client-core';
import type { DealerProfile } from '@pianotechpros/api-client';
import { useMobileSession } from '../src/session-provider';
import { useDealerRequest } from '../src/use-dealer-request';
import { useNativeTheme } from '../src/native-theme';
import { usePullRefresh } from '../src/use-pull-refresh';

function NavigationRow({label,onPress,disabled=false,disclosure=true}: {label:string;onPress:()=>void;disabled?:boolean;disclosure?:boolean}) {
  const theme=useNativeTheme();
  return <View style={{backgroundColor:theme.surface,borderBottomWidth:1,borderColor:theme.border}}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    android_ripple={{color:theme.border,foreground:true}}
    style={({pressed})=>({minHeight:Platform.OS==='android'?48:44,paddingHorizontal:16,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:12,opacity:disabled?0.5:pressed?0.65:1})}>
    <Text style={{flex:1,color:theme.accent,fontSize:17}}>{label}</Text>
    {disclosure?<Text accessible={false} importantForAccessibility="no" style={{color:theme.secondary,fontSize:24}}>›</Text>:null}
  </Pressable></View>;
}

function ShopList({ accountId, header }: { accountId: string; header: ReactNode }) {
  const { i18n } = useMobileSession();
  const request = useDealerRequest();
  const theme = useNativeTheme();
  const router = useRouter();
  const [directory] = useState(() => createDealerDirectory<DealerProfile, boolean>(() => true));
  const [state, setState] = useState(directory.snapshot());
  const pull = usePullRefresh(() => directory.refresh());
  useEffect(() => {
    const unsubscribe = directory.subscribe(setState);
    directory.replaceSession(accountId, { list: (cursor) => request((api) => api.list(cursor)), get: (id) => request((api) => api.get(id)) });
    return () => { unsubscribe(); directory.clear(); };
  }, [directory, accountId, request]);
  useFocusEffect(useCallback(() => { void directory.refresh(); }, [directory]));
  return <FlatList contentInsetAdjustmentBehavior="automatic" data={state.items} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 20, gap: 1, flexGrow: 1 }}
    refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => { void pull.refresh(); }} tintColor={theme.accent} />}
    ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>{header}<Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '600', marginBottom: 16 }}>{i18n.t('dealer.heading')}</Text><View style={{borderRadius:12,overflow:'hidden'}}><NavigationRow label={i18n.t('dealer.create')} onPress={() => router.push('/dealers/form')} /><NavigationRow label={i18n.t('staff.join')} onPress={() => router.push('/dealers/join')} /></View></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => router.push({ pathname: '/dealers/[id]', params: { id: item.id } })} style={({ pressed }) => ({ minHeight: 52, padding: 16, backgroundColor: theme.surface, opacity: pressed ? 0.65 : 1, borderBottomWidth: 1, borderColor: theme.border })}><Text style={{ color: theme.text, fontSize: 18 }}>{item.name}</Text>{item.tagline ? <Text style={{ color: theme.secondary, fontSize: 16, marginTop: 5 }}>{item.tagline}</Text> : null}</Pressable>}
    ListEmptyComponent={!state.listLoading && !state.listFailure && !state.nextCursor ? <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('dealer.empty')}</Text> : null}
    ListFooterComponent={<View style={{ gap: 12, paddingVertical: 16 }}>{state.listLoading ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary }}>{i18n.t('common.loading')}</Text> : null}{state.listFailure ? <><Text accessibilityRole="alert" style={{ color: theme.text }}>{i18n.t('dealer.loadFailed')}</Text><Button title={i18n.t('dealer.retry')}  onPress={() => { void (state.listFailureOperation === 'more' ? directory.loadMore() : directory.refresh()); }} /></> : null}{state.nextCursor ? <Button title={i18n.t('dealer.more')}  disabled={state.listLoading} onPress={() => { void directory.loadMore(); }} /> : null}</View>} />;
}
export default function Home() {
  const router=useRouter();const auth = useMobileSession(); const theme = useNativeTheme(); const { i18n } = auth;
  if(auth.ready&&auth.profile&&auth.session&&auth.scanState.pending)return <Redirect href="/scan" />;
  const signedIn=!!(auth.ready&&auth.profile&&auth.session);
  const header=<View style={{gap:20,marginBottom:16}}>
    <View style={{gap:12}}>
      <Text style={{color:theme.secondary,fontSize:17}}>{!auth.ready?i18n.t('common.loading'):auth.accessState==='authenticated_offline'?i18n.t('auth.offline'):auth.profile?i18n.t('auth.signedInAs',{name:auth.profile.displayName||auth.profile.email}):i18n.t('auth.ready')}</Text>
      {auth.errorKey?<Text accessibilityRole="alert" style={{color:theme.text}}>{i18n.t(auth.errorKey)}</Text>:null}
      {auth.session?<NavigationRow label={i18n.t('auth.signOut')} disclosure={false} disabled={!auth.ready} onPress={()=>{void auth.signOut();}}/>:<Button title={i18n.t('auth.signIn')} disabled={!auth.ready||!auth.signInReady} onPress={()=>{void auth.signIn();}}/>}
    </View>
    <Button title={i18n.t('scan.native.open')} disabled={!auth.ready} onPress={()=>router.push('/scan')}/>
    {signedIn?<View style={{borderRadius:12,overflow:'hidden'}}>
      <NavigationRow label={i18n.t('customer.heading')} onPress={()=>router.push('/customer')}/>
      <NavigationRow label={i18n.t('technician.heading')} onPress={()=>router.push('/technician')}/>
    </View>:null}
  </View>;
  return <View style={{flex:1,backgroundColor:theme.background}}>
    {signedIn&&auth.profile?<ShopList key={auth.profile.id} accountId={auth.profile.id} header={header}/>:<ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{padding:20}}>{header}</ScrollView>}
  </View>;
}
