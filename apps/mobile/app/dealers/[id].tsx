import { useCallback, useEffect, useState } from 'react';
import { Button, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { DealerProfile } from '@pianotechpros/api-client';
import { createDealerDirectory } from '@pianotechpros/client-core';
import type { MessageKey } from '@pianotechpros/i18n';
import { useMobileSession } from '../../src/session-provider';
import { useDealerRequest } from '../../src/use-dealer-request';
import { useNativeTheme } from '../../src/native-theme';
import { usePullRefresh } from '../../src/use-pull-refresh';

function Profile({ id, accountId }: { id: string; accountId: string }) {
  const router = useRouter();
  const { i18n } = useMobileSession(); const theme = useNativeTheme(); const request = useDealerRequest();
  const [directory] = useState(() => createDealerDirectory<DealerProfile, boolean>(() => true));
  const [state, setState] = useState(directory.snapshot());
  const pull = usePullRefresh(() => directory.select(id));
  useEffect(() => {
    const unsubscribe = directory.subscribe(setState);
    directory.replaceSession(accountId, { list: (cursor) => request((api) => api.list(cursor)), get: (key) => request((api) => api.get(key)) });
    return () => { unsubscribe(); directory.clear(); };
  }, [id, accountId, directory, request]);
  useFocusEffect(useCallback(() => { void directory.select(id); }, [directory, id]));
  const shop = state.selected;
  const field = (label: MessageKey, value?: string) => value ? <View key={label} style={{ gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}><Text style={{ color: theme.secondary, fontSize: 15 }}>{i18n.t(label)}</Text><Text selectable style={{ color: theme.text, fontSize: 18 }}>{value}</Text></View> : null;
  return <><Stack.Screen options={{ title: shop?.name ?? i18n.t('dealer.heading') }} /><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => { void pull.refresh(); }} tintColor={theme.accent} />}>
    {state.detailLoading ? <Text style={{ color: theme.secondary }}>{i18n.t('common.loading')}</Text> : null}
    {state.detailFailure ? <><Text accessibilityRole="alert" style={{ color: theme.text }}>{i18n.t('dealer.detailFailed')}</Text><Button title={i18n.t('dealer.retry')} color={theme.accent} onPress={() => { void directory.select(id); }} /></> : null}
    {shop ? <><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 28, fontWeight: '600' }}>{shop.name}</Text><Button title={i18n.t('dealer.edit')} color={theme.accent} onPress={() => router.push({ pathname: '/dealers/form', params: { id } })} />
      <Button title={i18n.t('inventory.browse')} color={theme.accent} onPress={() => router.push({ pathname: '/inventory', params: { dealerID: id } })} />
      <Button title={i18n.t('staff.manage')} color={theme.accent} onPress={() => router.push({ pathname: '/dealers/staff', params: { id } })} />
      {field('dealer.tagline', shop.tagline)}{field('dealer.description', shop.description)}{field('dealer.email', shop.email)}{field('dealer.phone', shop.phone)}{field('dealer.website', shop.website_url)}
      {field('dealer.address', [shop.street_address_1, shop.street_address_2, shop.city, shop.region, shop.postal_code].filter(Boolean).join('\n'))}
      {field('dealer.showroom', i18n.t(shop.showroom_published ? 'dealer.published' : 'dealer.private'))}
      {field('dealer.appointment', shop.appointment_note)}{field('dealer.delivery', shop.delivery_note)}{field('dealer.warranty', shop.warranty_note)}{field('dealer.service', shop.service_note)}
    </> : null}
  </ScrollView></>;
}
export default function DealerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const auth = useMobileSession(); const theme = useNativeTheme();
  if (!auth.ready) return <View style={{ flex: 1, padding: 20 }}><Text style={{ color: theme.text }}>{auth.i18n.t('common.loading')}</Text></View>;
  if (!auth.session || !auth.profile || typeof id !== 'string') return <Redirect href="/" />;
  return <Profile key={JSON.stringify([auth.profile.id, id])} id={id} accountId={auth.profile.id} />;
}
