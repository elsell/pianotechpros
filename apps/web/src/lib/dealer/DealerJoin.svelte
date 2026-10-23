<script lang="ts">
  import { onMount } from 'svelte';
  import { DealerClientError } from '@pianotechpros/api-client';
  import { createDealerJoin, InvitationCodeError, type DealerInvitationCode, type DealerInvitationPreview } from '@pianotechpros/client-core';
  import type { MessageKey, Translator } from '@pianotechpros/i18n';
  export let accountId: string;
  export let api: {
    preview(input: DealerInvitationCode): Promise<DealerInvitationPreview>;
    accept(input: DealerInvitationCode): Promise<{ dealerID: string; userID: string; active: boolean; grantPending: boolean }>;
    access(id: string): Promise<{ id: string }>;
  };
  export let i18n: Translator;
  export let onCancel: () => void;
  export let onJoined: (id: string) => void;
  const controller = createDealerJoin(accountId, api);
  let state = controller.snapshot();
  let code = '';
  let active = true;
  let errorKey: MessageKey;
  $: errorKey = state.failure instanceof InvitationCodeError || state.failure instanceof DealerClientError && state.failure.code === 'invalid_invitation' ? 'staff.invalidCode' : state.failure instanceof DealerClientError && state.failure.code === 'not_found' ? 'staff.accessPending' : 'staff.joinFailed';
  onMount(() => {
    const unsubscribe = controller.subscribe((next) => { state = next; if (next.accepted || next.accessReady) code = ''; });
    return () => { active = false; code = ''; unsubscribe(); controller.dispose(); };
  });
  async function checkAccess() {
    await controller.checkAccess();
    if (active && controller.snapshot().accessReady && state.preview) onJoined(state.preview.dealerID);
  }
</script>
<section aria-busy={state.busy}>
  <h3>{i18n.t('staff.join')}</h3>
  {#if !state.accepted}
    <form onsubmit={(event) => { event.preventDefault(); void controller.preview(code); }}>
      <label>{i18n.t('staff.pasteCode')}<textarea required maxlength="4096" rows="5" bind:value={code} oninput={() => controller.reset()} disabled={state.busy} autocomplete="off" autocapitalize="none" spellcheck={false}></textarea></label>
      <button type="submit" disabled={state.busy || !code}>{i18n.t('staff.preview')}</button>
    </form>
  {/if}
  {#if state.preview}
    <article>
      <h4>{state.preview.dealerName}</h4>
      <p>{i18n.t(state.preview.role === 'editor' ? 'staff.editor' : 'staff.viewer')}</p>
      <p>{i18n.t('staff.expires', { date: i18n.date(new Date(state.preview.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
      {#if state.accepted}
        <p role="status">{i18n.t('staff.accepted')}</p>
        {#if state.grantPending}<p>{i18n.t('staff.pending')}</p>{/if}
      {:else}<p>{i18n.t('staff.previewHelp')}</p><button disabled={state.busy} onclick={() => controller.accept()}>{i18n.t('staff.accept')}</button>{/if}
      {#if state.accepted || state.failure}<button disabled={state.busy} onclick={checkAccess}>{i18n.t('staff.checkAccess')}</button>{/if}
    </article>
  {/if}
  {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
  {#if state.failure}<p role="alert">{i18n.t(errorKey)}</p>{/if}
  <button onclick={onCancel}>{i18n.t('dealer.cancel')}</button>
</section>
<style>
  h3{font-size:1.4rem}h4{font-size:1.2rem;margin-top:0}label{display:flex;flex-direction:column;gap:.5rem}textarea,button{font:inherit;border:1px solid #9caf9f;border-radius:.5rem;padding:.7rem;background:white;color:#183e32}textarea{width:100%;box-sizing:border-box;resize:vertical}button{min-height:44px;cursor:pointer;margin:.75rem .5rem .25rem 0}button:disabled{opacity:.55;cursor:wait}article{border:1px solid #bdc9c3;border-radius:.65rem;padding:1rem;margin-top:1.5rem;overflow-wrap:anywhere}button:focus-visible,textarea:focus-visible{outline:3px solid #246aab;outline-offset:2px}
</style>
