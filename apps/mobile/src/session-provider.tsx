import * as SecureStore from 'expo-secure-store';
import { clearMobileInventoryRecovery } from './inventory/recovery-storage';
import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSessionApiClient, sessionExpiryAdvanced, sessionRefreshDelay, sessionRefreshLeadMs } from '@pianotechpros/api-client';
import { classifySessionFailure, isSessionFailure, refreshSessionCredential, sessionCredentialFromResponse, sessionRetryDelay, validateSessionCredential, type SessionAccessState, type SessionFailure } from '@pianotechpros/client-core';
import { type MessageKey } from '@pianotechpros/i18n';
import { createDeviceTranslator } from './i18n';
import { loadMobileConfig } from './config';
import { activateExchangedSession } from './session-establishment';
import { restoreStoredSession } from './session-restoration';
import { useProviderSignIn } from './provider-auth';
import { createSessionLifecycle, dismissSession, type SessionLease } from '@pianotechpros/client-core';

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

function useSessionState() {
  const [lifecycle] = useState(() => createSessionLifecycle(saveSession));
  const [session, setSession] = useState<Session | null>(null);
  const [accessState, setAccessState] = useState<SessionAccessState>('authentication_required');
  const [sessionRenewable, setSessionRenewable] = useState(true);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [privateBlocked, setPrivateBlocked] = useState(false);
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
    setPrivateBlocked(false);
    setAccessState('authenticated_online');
    setErrorKey(null);
    setRetryAttempt(0);
  }
  async function clearSession(message: MessageKey | null = null, state: SessionAccessState = 'authentication_required') {
    const token = session?.token;
    const cleared = await dismissSession({
      block: () => { setPrivateBlocked(true); setReady(false); },
      clear: async () => {
        const results = await Promise.allSettled([lifecycle.clear(), clearMobileInventoryRecovery()]);
        if (results.some(result => result.status === 'rejected')) throw new Error('session_cleanup_failed');
      },
      failed: () => { setErrorKey('errors.signOutFailed'); setReady(true); },
      complete: () => { setSession(null); setRetryAttempt(0); setProfile(null); setAccessState(state); setErrorKey(message); setReady(true); },
    });
    if (!cleared) return;
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
    if (!session || privateBlocked) return;
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
  }, [session?.token, session?.expiresAt, sessionRenewable, accessState, retryAttempt, privateBlocked]);

  return { session, profile: privateBlocked ? null : profile, ready, accessState, errorKey, apiURL, i18n,
    signInReady: providerSignIn.ready,
    signIn: () => providerSignIn.begin(),
    signOut: () => clearSession(),
    reject: (token: string) => { if (session?.token === token) void clearSession('errors.sessionExpired'); },
  };
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export function MobileSessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function useMobileSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('mobile_session_provider_missing');
  return value;
}
