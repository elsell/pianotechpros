import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { useEffect, useState } from 'react';
import { Button, SafeAreaView, Text } from 'react-native';
import { createSessionApiClient, sessionExpiryAdvanced, sessionRefreshDelay, sessionRefreshLeadMs } from '@pianotechpros/api-client';
import { classifySessionFailure, isSessionFailure, refreshSessionCredential, sessionCredentialFromResponse, sessionRetryDelay, validateSessionCredential, type SessionAccessState, type SessionFailure } from '@pianotechpros/client-core';
import { type MessageKey } from '@pianotechpros/i18n';
import { createDeviceTranslator } from '../src/i18n';
import { loadMobileConfig } from '../src/config';
import { activateExchangedSession } from '../src/session-establishment';
import { restoreStoredSession } from '../src/session-restoration';
import { useProviderSignIn } from '../src/provider-auth';
import { createSessionLifecycle, type SessionLease } from '@pianotechpros/client-core';

const { apiURL, oidcClientId: clientId, oidcIssuer: issuer } = loadMobileConfig(Constants.expoConfig?.extra);
const storageKey = 'application_session';
const i18n = createDeviceTranslator(getLocales);

type Session = { token: string; expiresAt: string };
type Profile = { id: string; email: string; displayName: string };
class LocalizedError extends Error { constructor(readonly key: MessageKey) { super(key); } }

async function saveSession(session: Session | null) {
  if (session) await SecureStore.setItemAsync(storageKey, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(storageKey);
}
function localizedFailure(cause: unknown, fallback: MessageKey): MessageKey { return cause instanceof LocalizedError ? cause.key : fallback; }

export default function Home() {
  const [lifecycle] = useState(() => createSessionLifecycle(saveSession));
  const [session, setSession] = useState<Session | null>(null);
  const [accessState, setAccessState] = useState<SessionAccessState>('authentication_required');
  const [sessionRenewable, setSessionRenewable] = useState(true);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const providerSignIn = useProviderSignIn(issuer, clientId, 'pianotechpros');

  async function refreshSession(lease: SessionLease, current: Session): Promise<Session> {
    return refreshSessionCredential(
      current,
      async (value) => createSessionApiClient(apiURL, () => value.token).refresh(),
      lease.persist,
    );
  }
  async function activate(lease: SessionLease, next: Session, renewable = true) {
    if (!lease.current()) return;
    await lease.persist(next);
    if (!lease.current()) return;
    setSessionRenewable(renewable); setSession(next);
    const nextProfile = await validateSessionCredential<Profile>(next, async (current) =>
      createSessionApiClient(apiURL, () => current.token).profile(),
    );
    if (!lease.current()) return;
    setProfile(nextProfile);
    setAccessState('authenticated_online');
    setRetryAttempt(0);
  }
  async function clearSession(message: MessageKey | null = null, state: SessionAccessState = 'authentication_required') {
    const token = session?.token;
    const cleared = lifecycle.clear();
    setReady(false);
    try { await cleared; }
    catch { setErrorKey('errors.signOutFailed'); return; }
    finally { setReady(true); }
    setSession(null); setRetryAttempt(0); setProfile(null); setAccessState(state); setErrorKey(message);
    if (token) try { await createSessionApiClient(apiURL, () => token).revoke(); } catch { /* local disposal is authoritative */ }
  }
  async function handleSessionFailure(lease: SessionLease, cause: unknown, current: Session) {
    if (!lease.current()) return;
    const failure: SessionFailure = isSessionFailure(cause) ? cause : { kind: 'network' };
    const decision = classifySessionFailure(failure);
    if (decision.discardCredential) {
      await clearSession(decision.state === 'local_session_unreadable' ? 'errors.localSessionUnreadable' : 'errors.sessionExpired', decision.state);
      return;
    }
    await lease.persist(current);
    if (!lease.current()) return;
    setSession(current); setAccessState('authenticated_offline');
    if (!decision.retryable) { setSessionRenewable(false); setRetryAttempt(0); }
    if (decision.retryable) setRetryAttempt((attempt) => attempt + 1);
    setErrorKey(decision.retryable ? 'errors.temporarilyUnavailable' : 'errors.apiRejected');
  }

  useEffect(() => {
    const lease = lifecycle.capture();
    void restoreStoredSession({
      read: () => SecureStore.getItemAsync(storageKey),
      now: () => Date.now(),
      refreshLeadMs: sessionRefreshLeadMs,
      refresh: (current) => refreshSession(lease, current),
      expiryAdvanced: sessionExpiryAdvanced,
      activate: (current, renewable) => activate(lease, current, renewable),
      handleFailure: (cause, current) => handleSessionFailure(lease, cause, current),
      handleUnreadable: async () => { if (lease.current()) await clearSession('errors.localSessionUnreadable', 'local_session_unreadable'); },
    }).finally(() => setReady(true));
    return () => lifecycle.invalidate();
  }, []);

  useEffect(() => {
    if (!providerSignIn.identityToken && !providerSignIn.failed) return;
    const lease = lifecycle.capture();
    (async () => {
      try {
        if (providerSignIn.failed || !providerSignIn.identityToken) throw new LocalizedError('errors.identityTokenMissing');
        let apiResponse: Awaited<ReturnType<ReturnType<typeof createSessionApiClient>['exchange']>>;
        try { apiResponse = await createSessionApiClient(apiURL, () => null).exchange(providerSignIn.identityToken); }
        catch { throw { kind: 'network' } satisfies SessionFailure; }
        const next = sessionCredentialFromResponse(apiResponse);
        const activationFailure = await activateExchangedSession(next, (current) => activate(lease, current), lease.persist);
        if (activationFailure) await handleSessionFailure(lease, activationFailure.failure, next);
      } catch (cause) {
        if (!lease.current()) return;
        if (session) await handleSessionFailure(lease, cause, session);
        else { setAccessState('authentication_required'); setErrorKey(localizedFailure(cause, 'errors.signInFailed')); }
      }
      finally { providerSignIn.acknowledge(); setReady(true); }
    })();
  }, [providerSignIn.identityToken, providerSignIn.failed]);

  useEffect(() => {
    if (!session) return;
    const lease = lifecycle.capture();
    const untilExpiry = Date.parse(session.expiresAt) - Date.now();
    if (untilExpiry <= 0) { void clearSession('errors.sessionExpired'); return; }
    const delay = accessState === 'authenticated_offline' && retryAttempt > 0 ? sessionRetryDelay(retryAttempt, session.expiresAt) : sessionRenewable ? sessionRefreshDelay(session.expiresAt) : untilExpiry;
    const timer = setTimeout(() => {
      if (!lease.current()) return;
      if (!sessionRenewable && (accessState !== 'authenticated_offline' || retryAttempt === 0)) { void clearSession('errors.sessionExpired'); return; }
      void (async () => {
        let next: Session;
        try { next = await refreshSession(lease, session); }
        catch (cause) { await handleSessionFailure(lease, cause, session); return; }
        try { await activate(lease, next, sessionExpiryAdvanced(session.expiresAt, next.expiresAt)); }
        catch (cause) { await handleSessionFailure(lease, cause, next); }
      })();
    }, delay);
    return () => clearTimeout(timer);
  }, [session?.token, session?.expiresAt, sessionRenewable, accessState, retryAttempt]);

  return <SafeAreaView style={{ padding: 32, gap: 16 }}>
    <Text style={{ fontSize: 32 }}>{i18n.t('app.title')}</Text>
    <Text>{!ready ? i18n.t('common.loading') : accessState === 'authenticated_offline' ? i18n.t('auth.offline') : profile ? i18n.t('auth.signedInAs', { name: profile.displayName || profile.email }) : i18n.t('auth.ready')}</Text>
    {errorKey ? <Text accessibilityRole="alert">{i18n.t(errorKey)}</Text> : null}
    <Button title={i18n.t(session ? 'auth.signOut' : 'auth.signIn')} disabled={!ready || (!session && !providerSignIn.ready)} onPress={() => session ? void clearSession() : void providerSignIn.begin()} />
  </SafeAreaView>;
}
