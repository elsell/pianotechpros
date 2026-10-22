<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createSessionApiClient, sessionExpiryAdvanced, sessionRefreshDelay, sessionRefreshLeadMs } from '@pianotechpros/api-client';
  import { classifySessionFailure, isSessionFailure, retainedSessionExpiry, sessionRetryDelay, validateSessionCredential, type ClientRuntimeConfig, type SessionAccessState, type SessionFailure } from '@pianotechpros/client-core';
  import { createTranslator, type MessageKey, type SupportedLocale, type Translator } from '@pianotechpros/i18n';
  import { applicationSession, beginApplicationSignIn, clearApplicationSession, refreshApplicationSession, revokeApplicationSession, type ApplicationSession } from '$lib/auth';

  import DealerDirectory from '$lib/dealer/DealerDirectory.svelte';

  export let data: { locale: SupportedLocale; config: ClientRuntimeConfig };
  let profile: { id: string; email: string; displayName: string } | null = null;
  let ready = false;
  let dealerCredential: ApplicationSession | null = null;
  let generation = 0;
  onDestroy(() => { generation++; if (refreshTimer) clearTimeout(refreshTimer); });
  let errorKey: MessageKey | null = null;
  let accessState: SessionAccessState = 'authentication_required';
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshAttempt = 0;
  let i18n: Translator;
  $: i18n = createTranslator([data.locale]);

  function scheduleExpiration(expiresAt: string) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      generation++;
      clearApplicationSession();
      dealerCredential = null;
      profile = null;
      errorKey = 'errors.sessionExpired';
    }, Math.max(0, Date.parse(expiresAt) - Date.now()));
  }

  function scheduleRetry(expiresAt: string) {
    const delay = sessionRetryDelay(refreshAttempt, expiresAt);
    refreshAttempt += 1;
    if (delay <= 0) { scheduleExpiration(expiresAt); return; }
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void attemptRefresh(expiresAt), delay);
  }

  async function loadProfile(session: ApplicationSession) {
    const expected = generation;
    const loaded = await validateSessionCredential(session, async (current) =>
      createSessionApiClient(data.config.apiURL, () => current.token).profile(),
    );
    if (expected !== generation || applicationSession()?.token !== session.token) return;
    profile = loaded;
    dealerCredential = session;
  }

  async function attemptRefresh(expiresAt: string) {
    const expected = generation;
    try {
      const next = await refreshApplicationSession(data.config);
      if (expected !== generation) return;
      if (profile) dealerCredential = next;
      await loadProfile(next);
      if (expected !== generation) return;
      accessState = 'authenticated_online';
      errorKey = null;
      refreshAttempt = 0;
      if (sessionExpiryAdvanced(expiresAt, next.expiresAt)) scheduleRefresh(next.expiresAt);
      else scheduleExpiration(next.expiresAt);
    } catch (cause) {
      if (expected !== generation) return;
      const failure: SessionFailure = isSessionFailure(cause) ? cause : { kind: 'network' };
      const decision = classifySessionFailure(failure);
      if (decision.discardCredential) { clearApplicationSession(); profile = null; dealerCredential = null; }
      else {
        const retainedExpiry = retainedSessionExpiry(applicationSession(), expiresAt);
        accessState = 'authenticated_offline';
        if (decision.retryable) scheduleRetry(retainedExpiry);
        else scheduleExpiration(retainedExpiry);
      }
      errorKey = decision.retryable ? 'errors.temporarilyUnavailable' : decision.discardCredential ? 'errors.sessionExpired' : 'errors.apiRejected';
    }
  }

  function scheduleRefresh(expiresAt: string) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void attemptRefresh(expiresAt), sessionRefreshDelay(expiresAt));
  }

  onMount(async () => {
    const expected = generation;
    try {
      let session = applicationSession();
      if (session) {
        if (Date.parse(session.expiresAt) - Date.now() < sessionRefreshLeadMs) {
          const previousExpiry = session.expiresAt;
          session = await refreshApplicationSession(data.config);
          if (expected !== generation) return;
          if (sessionExpiryAdvanced(previousExpiry, session.expiresAt)) scheduleRefresh(session.expiresAt);
          else scheduleExpiration(session.expiresAt);
        } else scheduleRefresh(session.expiresAt);
        await loadProfile(session);
        if (expected !== generation) return;
        accessState = 'authenticated_online';
      }
    } catch (cause) {
      if (expected !== generation) return;
      const failure: SessionFailure = isSessionFailure(cause) ? cause : { kind: 'network' };
      const decision = classifySessionFailure(failure);
      if (decision.discardCredential) clearApplicationSession();
      else {
        accessState = 'authenticated_offline';
        const current = applicationSession();
        if (current) decision.retryable ? scheduleRetry(current.expiresAt) : scheduleExpiration(current.expiresAt);
      }
      errorKey = decision.retryable ? 'errors.temporarilyUnavailable' : decision.discardCredential ? (decision.state === 'local_session_unreadable' ? 'errors.localSessionUnreadable' : 'errors.sessionExpired') : 'errors.apiRejected';
    } finally { ready = true; }
  });

  async function signIn() {
    errorKey = null;
    try { await beginApplicationSignIn(data.config); }
    catch { errorKey = 'errors.signInFailed'; }
  }

  async function signOut() {
    generation++;
    if (refreshTimer) clearTimeout(refreshTimer);
    accessState = 'authentication_required';
    profile = null;
    dealerCredential = null;
    await revokeApplicationSession(data.config);
  }
  function rejectDealerSession() {
    if (!dealerCredential || applicationSession()?.token !== dealerCredential.token) return;
    generation++;
    if (refreshTimer) clearTimeout(refreshTimer);
    clearApplicationSession();
    dealerCredential = null;
    profile = null;
    accessState = 'authentication_required';
    errorKey = 'errors.sessionExpired';
  }
</script>

<main>
  <h1>{i18n.t('app.title')}</h1>
  {#if !ready}<p>{i18n.t('common.loading')}</p>
  {:else if accessState === 'authenticated_offline' && applicationSession()}<p>{i18n.t('auth.offline')}</p><button onclick={signOut}>{i18n.t('auth.signOut')}</button>
  {:else if profile}<p>{i18n.t('auth.signedInAs', { name: profile.displayName || profile.email })}</p><button onclick={signOut}>{i18n.t('auth.signOut')}</button>
  {:else}<p>{i18n.t('app.ready')}</p><button onclick={signIn}>{i18n.t('auth.signIn')}</button>{/if}
  {#if profile && dealerCredential}
    {#key profile.id}<DealerDirectory accountId={profile.id} apiURL={data.config.apiURL} credential={dealerCredential} {i18n} onSessionRejected={rejectDealerSession} />{/key}
  {/if}
  {#if errorKey}<p role="alert">{i18n.t(errorKey)}</p>{/if}
</main>
<style>main{font:16px system-ui;max-width:68rem;margin:5vh auto;padding:2rem}button{padding:.65rem 1rem;border:0;border-radius:.5rem;background:#111;color:white}</style>
