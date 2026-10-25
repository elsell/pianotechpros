import { useCallback, useEffect, useState } from 'react';
import { Button, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { createDealerDirectory } from '@pianotechpros/client-core';
import type { DealerProfile } from '@pianotechpros/api-client';
import { useMobileSession } from '../src/session-provider';
import { useDealerRequest } from '../src/use-dealer-request';
import { useNativeTheme } from '../src/native-theme';
import { usePullRefresh } from '../src/use-pull-refresh';

function ShopList({ accountId }: { accountId: string }) {
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
    ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '600', marginBottom: 16 }}>{i18n.t('dealer.heading')}</Text><Button title={i18n.t('dealer.create')} color={theme.accent} onPress={() => router.push('/dealers/form')} /><Button title={i18n.t('staff.join')} color={theme.accent} onPress={() => router.push('/dealers/join')} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => router.push({ pathname: '/dealers/[id]', params: { id: item.id } })} style={({ pressed }) => ({ minHeight: 52, padding: 16, backgroundColor: theme.surface, opacity: pressed ? 0.65 : 1, borderBottomWidth: 1, borderColor: theme.border })}><Text style={{ color: theme.text, fontSize: 18 }}>{item.name}</Text>{item.tagline ? <Text style={{ color: theme.secondary, fontSize: 16, marginTop: 5 }}>{item.tagline}</Text> : null}</Pressable>}
    ListEmptyComponent={!state.listLoading && !state.listFailure && !state.nextCursor ? <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('dealer.empty')}</Text> : null}
    ListFooterComponent={<View style={{ gap: 12, paddingVertical: 16 }}>{state.listLoading ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary }}>{i18n.t('common.loading')}</Text> : null}{state.listFailure ? <><Text accessibilityRole="alert" style={{ color: theme.text }}>{i18n.t('dealer.loadFailed')}</Text><Button title={i18n.t('dealer.retry')} color={theme.accent} onPress={() => { void (state.listFailureOperation === 'more' ? directory.loadMore() : directory.refresh()); }} /></> : null}{state.nextCursor ? <Button title={i18n.t('dealer.more')} color={theme.accent} disabled={state.listLoading} onPress={() => { void directory.loadMore(); }} /> : null}</View>} />;
}
export default function Home() {
  const router=useRouter();const auth = useMobileSession(); const theme = useNativeTheme(); const { i18n } = auth;
  if(auth.ready&&auth.profile&&auth.session&&auth.scanState.pending)return <Redirect href="/scan" />;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ color: theme.secondary, fontSize: 17 }}>{!auth.ready ? i18n.t('common.loading') : auth.accessState === 'authenticated_offline' ? i18n.t('auth.offline') : auth.profile ? i18n.t('auth.signedInAs', { name: auth.profile.displayName || auth.profile.email }) : i18n.t('auth.ready')}</Text>
      {auth.errorKey ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{i18n.t(auth.errorKey)}</Text> : null}
      <Button title={i18n.t(auth.session ? 'auth.signOut' : 'auth.signIn')} color={theme.accent} disabled={!auth.ready || (!auth.session && !auth.signInReady)} onPress={() => { void (auth.session ? auth.signOut() : auth.signIn()); }} />
    </View>
    <Button title={i18n.t('scan.native.open')} color={theme.accent} disabled={!auth.ready} onPress={()=>router.push('/scan')} />
    {auth.ready && auth.profile && auth.session ? <Button title={i18n.t('customer.heading')} color={theme.accent} onPress={()=>router.push('/customer')} /> : null}
    {auth.ready && auth.profile && auth.session ? <ShopList key={auth.profile.id} accountId={auth.profile.id} /> : null}
  </View>;
}
