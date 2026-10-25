import {NativeButton as Button} from '../../src/native-button';
import { useEffect, useRef, useState } from 'react';
import {Alert,KeyboardAvoidingView,Platform,Pressable,RefreshControl,SectionList,Text,TextInput,View} from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { DealerClientError } from '@pianotechpros/api-client';
import { createDealerStaff, type StaffMember, type StaffInvitation, type StaffRole } from '@pianotechpros/client-core';
import { useMobileSession } from '../../src/session-provider';
import { useDealerRequest } from '../../src/use-dealer-request';
import { useNativeTheme } from '../../src/native-theme';
import { usePullRefresh } from '../../src/use-pull-refresh';

function Staff({ id }: { id: string }) {
  const { i18n } = useMobileSession(); const theme = useNativeTheme(); const request = useDealerRequest();
  const mounted = useRef(true);
  const [role, setRole] = useState<StaffRole>('viewer'); const [hours, setHours] = useState('72'); const [now, setNow] = useState(Date.now());
  const [controller] = useState(() => createDealerStaff({
    listStaff: (cursor) => request((api) => api.listStaff(id, cursor)),
    listInvitations: (cursor) => request((api) => api.listInvitations(id, cursor)),
    changeRole: (userID, nextRole, revision) => request((api) => api.changeStaffRole(id, userID, nextRole, revision)),
    remove: (userID, revision) => request((api) => api.removeStaff(id, userID, revision)),
    createInvitation: (nextRole, expiry) => request((api) => api.createInvitation(id, nextRole, expiry)),
    revokeInvitation: (invitationID) => request((api) => api.revokeInvitation(id, invitationID)),
  }, (error) => error instanceof DealerClientError && (error.status === 401 || ['not_found', 'forbidden'].includes(error.code))));
  const [state, setState] = useState(controller.snapshot());
  const pull = usePullRefresh(() => controller.refresh());
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState); void controller.refresh();
    let timer: ReturnType<typeof setTimeout>;
    function tick() { setNow(Date.now()); timer = setTimeout(tick, 60000); }
    timer = setTimeout(tick, 60000);
    return () => { mounted.current = false; clearTimeout(timer); unsubscribe(); controller.dispose(); };
  }, [controller]);
  const disabled = state.busy || !state.ready;
  const validHours = /^\d{1,3}$/.test(hours) && Number(hours) >= 1 && Number(hours) <= 168;
  const failureKey = state.failure instanceof DealerClientError && state.failure.code === 'conflict' ? 'staff.conflict' : state.failure instanceof DealerClientError && ['not_found', 'forbidden'].includes(state.failure.code) ? 'staff.denied' : 'staff.failed';
  function confirmRemove(member: StaffMember) {
    Alert.alert(i18n.t('staff.confirmRemove'), [i18n.t('staff.confirmRemoveText'), member.userID].join('\n\n'), [
      { text: i18n.t('dealer.cancel'), style: 'cancel' },
      { text: i18n.t('staff.confirmRemove'), style: 'destructive', onPress: () => { if (mounted.current) void controller.remove(member); } },
    ]);
  }
  function confirmRevoke(invitation: StaffInvitation) {
    Alert.alert(i18n.t('staff.confirmRevoke'), [i18n.t('staff.confirmRevokeText'), invitation.id].join('\n\n'), [
      { text: i18n.t('dealer.cancel'), style: 'cancel' },
      { text: i18n.t('staff.confirmRevoke'), style: 'destructive', onPress: () => { if (mounted.current) void controller.revokeInvitation(invitation); } },
    ]);
  }
  const textStyle = { color: theme.text, fontSize: 17 };
  const cardStyle = { padding: 16, gap: 12, backgroundColor: theme.surface, borderRadius: 12, marginVertical: 6 };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'height' : undefined}>
    <SectionList<StaffMember | StaffInvitation, { kind: 'members' | 'invitations' }>
      sections={[{ kind: 'members', data: state.members }, { kind: 'invitations', data: state.invitations }]}
      keyExtractor={(item) => 'userID' in item ? item.userID : item.id}
      stickySectionHeadersEnabled={false} automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => { void pull.refresh(); }} tintColor={theme.accent} />}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 24 }}>
        <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('staff.ownerOnly')}</Text>
        <Button title={i18n.t('staff.refresh')}  disabled={state.busy} onPress={() => { void controller.refresh(); }} />
        {state.busy ? <Text accessibilityLiveRegion="polite" style={textStyle}>{i18n.t('common.loading')}</Text> : null}
        {state.failure ? <Text accessibilityRole="alert" style={textStyle}>{i18n.t(failureKey)}</Text> : null}
        {state.issued ? <View style={cardStyle}>
          <Text accessibilityRole="header" style={{ ...textStyle, fontWeight: '600' }}>{i18n.t('staff.code')}</Text>
          <Text selectable accessibilityLabel={i18n.t('staff.code')} style={textStyle}>{JSON.stringify({ dealerID: state.issued.dealerID, invitationID: state.issued.id, token: state.issued.token })}</Text>
          <Text style={textStyle}>{i18n.t('staff.codeHelp')}</Text>
          <Button title={i18n.t('staff.dismissCode')}  onPress={() => controller.dismissIssued()} />
        </View> : null}
        {state.ready ? <View style={cardStyle}>
          <Text accessibilityRole="header" style={{ ...textStyle, fontSize: 22, fontWeight: '600' }}>{i18n.t('staff.invite')}</Text>
          <Text style={textStyle}>{i18n.t('staff.role')}</Text>
          {(['viewer', 'editor'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: role === choice, disabled: disabled || Boolean(state.issued) }} disabled={disabled || Boolean(state.issued)} onPress={() => setRole(choice)} style={{ minHeight: 48, padding: 12, borderWidth: role === choice ? 2 : 1, borderColor: role === choice ? theme.accent : theme.border, borderRadius: 8 }}><Text style={textStyle}>{i18n.t(choice === 'viewer' ? 'staff.viewer' : 'staff.editor')}</Text></Pressable>)}
          <Text style={textStyle}>{i18n.t('staff.expiryHours')}</Text>
          <TextInput accessibilityLabel={i18n.t('staff.expiryHours')} keyboardType="number-pad" maxLength={3} value={hours} onChangeText={setHours} editable={!disabled && !state.issued} style={{ ...textStyle, padding: 12, minHeight: 48, borderWidth: 1, borderColor: theme.border, borderRadius: 8 }} />
          {!validHours ? <Text accessibilityRole="alert" style={textStyle}>{i18n.t('staff.invalidExpiry')}</Text> : null}
          <Button title={i18n.t('staff.invite')}  disabled={disabled || !validHours || Boolean(state.issued)} onPress={() => { void controller.createInvitation(role, Number(hours)); }} />
        </View> : null}
      </View>}
      renderSectionHeader={({ section }) => state.ready || section.data.length ? <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '600', marginVertical: 12 }}>{i18n.t(section.kind === 'members' ? 'staff.members' : 'staff.invitations')}</Text> : null}
      renderItem={({ item }) => 'userID' in item ? <View style={cardStyle}>
        <Text style={{ color: theme.secondary, fontSize: 15 }}>{i18n.t('staff.userID')}</Text><Text selectable style={textStyle}>{item.userID}</Text>
        <Text style={textStyle}>{i18n.t(item.role === 'owner' ? 'staff.owner' : item.role === 'editor' ? 'staff.editor' : 'staff.viewer')}</Text>
        <Text style={textStyle}>{i18n.t(!item.active ? 'staff.removed' : item.grantPending ? 'staff.pending' : 'staff.active')}</Text>
        {item.role !== 'owner' && item.active ? <>
          <Button title={i18n.t(item.role === 'editor' ? 'staff.makeViewer' : 'staff.makeEditor')}  disabled={disabled || item.grantPending} onPress={() => { void controller.changeRole(item, item.role === 'editor' ? 'viewer' : 'editor'); }} />
          <Button title={i18n.t('staff.remove')}  disabled={disabled} onPress={() => confirmRemove(item)} />
        </> : null}
      </View> : <View style={cardStyle}>
        <Text style={textStyle}>{i18n.t(item.role === 'editor' ? 'staff.editor' : 'staff.viewer')}</Text>
        <Text style={textStyle}>{i18n.t(item.revokedAt ? 'staff.revoked' : item.consumedAt ? 'staff.used' : Date.parse(item.expiresAt) <= now ? 'staff.expired' : 'staff.offered')}</Text>
        <Text style={{ color: theme.secondary, fontSize: 17 }}>{i18n.t('staff.expires', { date: i18n.date(new Date(item.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</Text>
        {!item.consumedAt && !item.revokedAt ? <Button title={i18n.t('staff.revoke')}  disabled={disabled} onPress={() => confirmRevoke(item)} /> : null}
      </View>}
      renderSectionFooter={({ section }) => <View style={{ marginBottom: 24 }}>
        {state.ready && !section.data.length ? <Text style={textStyle}>{i18n.t(section.kind === 'members' ? 'staff.emptyMembers' : 'staff.emptyInvitations')}</Text> : null}
        {(section.kind === 'members' ? state.memberCursor : state.invitationCursor) ? <Button title={i18n.t(section.kind === 'members' ? 'staff.moreMembers' : 'staff.moreInvitations')}  disabled={disabled} onPress={() => { void (section.kind === 'members' ? controller.moreStaff() : controller.moreInvitations()); }} /> : null}
      </View>}
    />
  </KeyboardAvoidingView>;
}
export default function DealerStaffScreen() {
  const auth = useMobileSession(); const theme = useNativeTheme(); const { id } = useLocalSearchParams<{ id: string }>();
  if (!auth.ready) return <View style={{ padding: 20 }}><Text style={{ color: theme.text }}>{auth.i18n.t('common.loading')}</Text></View>;
  if (!auth.session || !auth.profile || typeof id !== 'string') return <Redirect href="/" />;
  return <Staff key={JSON.stringify([auth.profile.id, id])} id={id} />;
}
