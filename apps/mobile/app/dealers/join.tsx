import {NativeButton as Button} from '../../src/native-button';
import { useEffect, useState } from 'react';
import {KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { DealerClientError } from '@pianotechpros/api-client';
import { createDealerJoin, InvitationCodeError } from '@pianotechpros/client-core';
import { useMobileSession } from '../../src/session-provider';
import { useDealerRequest } from '../../src/use-dealer-request';
import { useNativeTheme } from '../../src/native-theme';

function Join({ accountId }: { accountId: string }) {
  const { i18n } = useMobileSession();
  const request = useDealerRequest();
  const theme = useNativeTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [controller] = useState(() => createDealerJoin(accountId, {
    preview: (input) => request((api) => api.previewInvitation(input.dealerID, input.invitationID, input.token)),
    accept: (input) => request((api) => api.acceptInvitation(input.dealerID, input.invitationID, input.token)),
    access: (id) => request((api) => api.get(id)),
  }));
  const [state, setState] = useState(controller.snapshot());
  useEffect(() => {
    const unsubscribe = controller.subscribe((next) => {
      setState(next);
      if (next.accepted || next.accessReady) setCode('');
    });
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  async function checkAccess() {
    await controller.checkAccess();
    const current = controller.snapshot();
    if (current.accessReady && current.preview) router.replace({ pathname: '/dealers/[id]', params: { id: current.preview.dealerID } });
  }
  const errorKey = state.failure instanceof InvitationCodeError || state.failure instanceof DealerClientError && state.failure.code === 'invalid_invitation'
    ? 'staff.invalidCode' : state.failure instanceof DealerClientError && state.failure.code === 'not_found' ? 'staff.accessPending' : 'staff.joinFailed';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : undefined}>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}>
      {!state.accepted ? <View style={{ gap: 12 }}>
        <Text style={{ color: theme.text, fontSize: 17 }}>{i18n.t('staff.pasteCode')}</Text>
        <TextInput accessibilityLabel={i18n.t('staff.pasteCode')} value={code} onChangeText={(value) => { controller.reset(); setCode(value); }} editable={!state.busy} multiline maxLength={4096} autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete="off" textContentType="none" importantForAutofill="no" textAlignVertical="top" style={{ minHeight: 140, padding: 14, borderWidth: 1, borderRadius: 10, borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, fontSize: 17 }} />
        <Button title={i18n.t('staff.preview')}  disabled={state.busy || !code} onPress={() => { void controller.preview(code); }} />
      </View> : null}
      {state.preview ? <View style={{ padding: 20, gap: 16, borderRadius: 12, backgroundColor: theme.surface }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '600' }}>{state.preview.dealerName}</Text>
        <Text style={{ color: theme.text, fontSize: 17 }}>{i18n.t(state.preview.role === 'editor' ? 'staff.editor' : 'staff.viewer')}</Text>
        <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('staff.expires', { date: i18n.date(new Date(state.preview.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</Text>
        {state.accepted ? <>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 17 }}>{i18n.t('staff.accepted')}</Text>
          {state.grantPending ? <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('staff.pending')}</Text> : null}
        </> : <>
          <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('staff.previewHelp')}</Text>
          <Button title={i18n.t('staff.accept')}  disabled={state.busy} onPress={() => { void controller.accept(); }} />
        </>}
        {state.accepted || state.failure ? <Button title={i18n.t('staff.checkAccess')}  disabled={state.busy} onPress={() => { void checkAccess(); }} /> : null}
      </View> : null}
      {state.busy ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('common.loading')}</Text> : null}
      {state.failure ? <Text accessibilityRole="alert" style={{ color: theme.text, fontSize: 17 }}>{i18n.t(errorKey)}</Text> : null}
      <Button title={i18n.t('dealer.cancel')}  onPress={() => router.back()} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

export default function JoinDealerScreen() {
  const auth = useMobileSession(); const theme = useNativeTheme();
  if (!auth.ready) return <View style={{ flex: 1, padding: 20 }}><Text style={{ color: theme.text }}>{auth.i18n.t('common.loading')}</Text></View>;
  if (!auth.session || !auth.profile) return <Redirect href="/" />;
  return <Join key={auth.profile.id} accountId={auth.profile.id} />;
}
