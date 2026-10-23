import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Button, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { DealerClientError, type DealerProfile, type DealerProfileInput } from '@pianotechpros/api-client';
import { createDealerEditor } from '@pianotechpros/client-core';
import { useMobileSession } from '../../src/session-provider';
import { useDealerRequest } from '../../src/use-dealer-request';
import { useNativeTheme } from '../../src/native-theme';
import { dealerFieldGroups } from '../../src/dealer-fields';

function Form({ initial }: { initial: DealerProfile | null }) {
  const { i18n } = useMobileSession(); const request = useDealerRequest(); const theme = useNativeTheme(); const router = useRouter();
  const [draft, setDraft] = useState<DealerProfileInput>(() => {
    const value: DealerProfileInput = { name: initial?.name ?? '', slug: initial?.slug ?? '', email: initial?.email ?? '', accent_color: initial?.accent_color ?? '#245b43', showroom_published: initial?.showroom_published ?? false };
    for (const group of dealerFieldGroups) for (const field of group.fields) value[field.key] = initial?.[field.key] ?? value[field.key] ?? '';
    return value;
  });
  const mounted = useRef(true);
  const [dirty, setDirty] = useState(false);
  const [controller] = useState(() => createDealerEditor<DealerProfileInput, DealerProfile>({
    initial, key: randomUUID,
    create: (input, key) => request((api) => api.create(input, key)),
    update: (id, input, revision) => request((api) => api.update(id, input, revision)),
    get: (id) => request((api) => api.get(id)),
    conflict: (error) => error instanceof DealerClientError && error.code === 'conflict',
    rejectedBeforeCreation: (error) => error instanceof DealerClientError && ['bad_request', 'validation_failed', 'conflict'].includes(error.code),
  }));
  const [state, setState] = useState(controller.snapshot());
  useEffect(() => { const unsubscribe = controller.subscribe(setState); return () => { mounted.current = false; unsubscribe(); controller.dispose(); }; }, [controller]);
  const close = useCallback(() => {
    const current = controller.snapshot();
    if (current.busy || current.uncertain) return;
    const leave = () => { if (mounted.current && !controller.snapshot().busy && !controller.snapshot().uncertain) router.back(); };
    if (!dirty) { leave(); return; }
    Alert.alert(i18n.t('dealer.discardTitle'), i18n.t('dealer.discardHelp'), [
      { text: i18n.t('dealer.continueEditing'), style: 'cancel' },
      { text: i18n.t('dealer.discard'), style: 'destructive', onPress: leave },
    ]);
  }, [controller, dirty, router, i18n]);
  useFocusEffect(useCallback(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; }); return () => subscription.remove(); }, [close]));
  async function save() {
    await controller.save(draft);
    const saved = controller.snapshot().saved;
    if (saved) router.dismissTo({ pathname: '/dealers/[id]', params: { id: saved.id } });
  }
  const locked = state.busy || state.uncertain;
  const failure = state.failure;
  const errorKey = failure instanceof DealerClientError && failure.code === 'conflict' ? (initial ? 'dealer.editConflict' : 'dealer.createConflict')
    : failure instanceof DealerClientError && ['bad_request', 'validation_failed'].includes(failure.code) ? 'dealer.invalid'
    : failure instanceof DealerClientError && ['not_found', 'forbidden'].includes(failure.code) ? 'dealer.detailFailed' : 'dealer.saveFailed';
  const display = (value: string | boolean | undefined) => typeof value === 'boolean' ? i18n.t(value ? 'dealer.published' : 'dealer.private') : value || i18n.t('dealer.notSet');
  const comparison = [...dealerFieldGroups.flatMap((group) => group.fields), { key: 'showroom_published' as const, label: 'dealer.showroom' as const }];
  return <>
    <Stack.Screen options={{ title: i18n.t(initial ? 'dealer.edit' : 'dealer.create'), gestureEnabled: false, headerBackVisible: false, headerLeft: () => <Button title={i18n.t('dealer.cancel')} disabled={locked} color={theme.accent} onPress={close} /> }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
        {initial ? <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('dealer.ownerOnly')}</Text> : null}
        {dealerFieldGroups.map((group) => <View key={group.label} style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '600', color: theme.text }}>{i18n.t(group.label)}</Text>
          {group.fields.map((field) => <View key={field.key} style={{ gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 17 }}>{i18n.t(field.label)}</Text>
            <TextInput accessibilityLabel={i18n.t(field.label)} value={draft[field.key] ?? ''} editable={!locked} onChangeText={(value) => { setDirty(true); setDraft((previous) => ({ ...previous, [field.key]: value })); }} maxLength={field.max} multiline={field.multiline} keyboardType={field.keyboard} autoCapitalize={field.literal ? 'none' : 'sentences'} autoCorrect={!field.literal} spellCheck={!field.literal} textAlignVertical="top" style={{ minHeight: field.multiline ? 112 : 48, fontSize: 17, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }} />
            {field.key === 'slug' ? <Text style={{ color: theme.secondary, fontSize: 15 }}>{i18n.t('dealer.slugHint')}</Text> : null}
          </View>)}
          {group.label === 'dealer.showroom' ? <View style={{ gap: 8 }}><Text style={{ color: theme.text, fontSize: 17 }}>{i18n.t('dealer.enableShowroom')}</Text><Switch accessibilityLabel={i18n.t('dealer.enableShowroom')} value={draft.showroom_published} disabled={locked} onValueChange={(value) => { setDirty(true); setDraft((previous) => ({ ...previous, showroom_published: value })); }} /></View> : null}
        </View>)}
        {failure ? <Text accessibilityRole="alert" style={{ color: theme.text, fontSize: 17 }}>{i18n.t(errorKey)}</Text> : null}
        {state.uncertain ? <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17 }}>{i18n.t('dealer.pendingCreation')}</Text> : null}
        {state.conflict ? <View style={{ gap: 16 }}>
          <Button title={i18n.t('dealer.reviewCurrent')} color={theme.accent} disabled={state.busy} onPress={() => { void controller.review(); }} />
          {state.latest ? <>
            {comparison.filter((field) => (state.latest?.[field.key] ?? '') !== (draft[field.key] ?? '')).map((field) => <View key={field.key} style={{ gap: 8, padding: 16, borderRadius: 10, backgroundColor: theme.surface }}>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20 }}>{i18n.t(field.label)}</Text>
              <Text style={{ color: theme.secondary, fontSize: 15 }}>{i18n.t('dealer.currentValue')}</Text><Text style={{ color: theme.text, fontSize: 17 }}>{display(state.latest?.[field.key])}</Text>
              <Text style={{ color: theme.secondary, fontSize: 15 }}>{i18n.t('dealer.yourValue')}</Text><Text style={{ color: theme.text, fontSize: 17 }}>{display(draft[field.key])}</Text>
            </View>)}
            <Button title={i18n.t('dealer.keepEdits')} color={theme.accent} disabled={state.busy} onPress={() => controller.keepEdits()} />
          </> : null}
        </View> : null}
        <Button title={i18n.t(state.busy ? 'dealer.saving' : state.uncertain ? 'dealer.retry' : initial ? 'dealer.save' : 'dealer.create')} color={theme.accent} disabled={state.busy || state.conflict} onPress={() => { void save(); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  </>;
}

function LoadForm({ id }: { id?: string }) {
  const request = useDealerRequest(); const { i18n } = useMobileSession(); const theme = useNativeTheme();
  const [initial, setInitial] = useState<DealerProfile | null>(null); const [failure, setFailure] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true; setFailure(false);
    void request((api) => api.get(id)).then((profile) => { if (active) setInitial(profile); }, () => { if (active) setFailure(true); });
    return () => { active = false; };
  }, [id, request, attempt]);
  if (id && !initial) return <View style={{ padding: 20, gap: 16 }}><Text accessibilityRole={failure ? 'alert' : undefined} style={{ color: theme.text, fontSize: 17 }}>{i18n.t(failure ? 'dealer.detailFailed' : 'common.loading')}</Text>{failure ? <Button title={i18n.t('dealer.retry')} color={theme.accent} onPress={() => setAttempt((value) => value + 1)} /> : null}</View>;
  return <Form initial={initial} />;
}
export default function DealerFormScreen() {
  const auth = useMobileSession(); const theme = useNativeTheme(); const { id } = useLocalSearchParams<{ id?: string }>();
  if (!auth.ready) return <View style={{ padding: 20 }}><Text style={{ color: theme.text }}>{auth.i18n.t('common.loading')}</Text></View>;
  if (!auth.session || !auth.profile || id !== undefined && typeof id !== 'string') return <Redirect href="/" />;
  return <LoadForm key={JSON.stringify([auth.profile.id, id])} id={id} />;
}
