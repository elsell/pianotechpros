<script lang="ts">
  import { onMount } from 'svelte';
  import { DealerClientError } from '@pianotechpros/api-client';
  import { createDealerStaff, type DealerStaffPort, type StaffMember, type StaffInvitation, type StaffRole } from '@pianotechpros/client-core';
  import type { MessageKey, Translator } from '@pianotechpros/i18n';
  export let api: DealerStaffPort;
  export let shopName: string;
  export let i18n: Translator;
  export let onBack: () => void;
  const controller = createDealerStaff(api);
  let state = controller.snapshot();
  let now = Date.now();
  let role: StaffRole = 'viewer';
  let hours = 72;
  let removal: StaffMember | null = null;
  let revocation: StaffInvitation | null = null;
  let errorKey: MessageKey;
  $: errorKey = state.failure instanceof DealerClientError && state.failure.code === 'conflict' ? 'staff.conflict' : state.failure instanceof DealerClientError && ['not_found', 'forbidden'].includes(state.failure.code) ? 'staff.denied' : 'staff.failed';
  onMount(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() { now = Date.now(); timer = setTimeout(tick, 60000); }
    timer = setTimeout(tick, 60000);
    const unsubscribe = controller.subscribe((next) => { state = next; });
    void controller.refresh();
    return () => { clearTimeout(timer); unsubscribe(); controller.dispose(); };
  });
  function refresh() { removal = null; revocation = null; void controller.refresh(); }
  async function remove() { if (removal) await controller.remove(removal); removal = null; }
  async function revoke() { if (revocation) await controller.revokeInvitation(revocation); revocation = null; }
</script>
<section aria-busy={state.busy}>
  <button onclick={onBack}>{i18n.t('staff.back')}</button>
  <h3>{i18n.t('staff.heading')}</h3><p class="shop-name">{shopName}</p><p>{i18n.t('staff.ownerOnly')}</p>
  <button disabled={state.busy} onclick={refresh}>{i18n.t('staff.refresh')}</button>
  {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
  {#if state.failure}<p role="alert">{i18n.t(errorKey)}</p>{/if}
  {#if state.issued}
    <aside>
      <label>{i18n.t('staff.code')}<textarea readonly rows="5" value={JSON.stringify({ dealerID: state.issued.dealerID, invitationID: state.issued.id, token: state.issued.token })}></textarea></label>
      <p>{i18n.t('staff.codeHelp')}</p><button onclick={() => controller.dismissIssued()}>{i18n.t('staff.dismissCode')}</button>
    </aside>
  {/if}
  {#if state.ready || state.members.length}
    <h4>{i18n.t('staff.members')}</h4>
    {#each state.members as member (member.userID)}
      <article>
        <dl><dt>{i18n.t('staff.userID')}</dt><dd>{member.userID}</dd></dl>
        <p>{i18n.t(member.role === 'owner' ? 'staff.owner' : member.role === 'editor' ? 'staff.editor' : 'staff.viewer')} · {i18n.t(!member.active ? 'staff.removed' : member.grantPending ? 'staff.pending' : 'staff.active')}</p>
        {#if member.role !== 'owner' && member.active}
          <button disabled={state.busy || !state.ready || member.grantPending} onclick={() => controller.changeRole(member, member.role === 'editor' ? 'viewer' : 'editor')}>{i18n.t(member.role === 'editor' ? 'staff.makeViewer' : 'staff.makeEditor')}</button>
          <button disabled={state.busy || !state.ready} onclick={() => { removal = member; revocation = null; }}>{i18n.t('staff.remove')}</button>
          {#if removal?.userID === member.userID}<p>{i18n.t('staff.confirmRemoveText')}</p><button disabled={state.busy || !state.ready} onclick={remove}>{i18n.t('staff.confirmRemove')}</button><button onclick={() => { removal = null; }}>{i18n.t('dealer.cancel')}</button>{/if}
        {/if}
      </article>
    {:else}<p>{i18n.t('staff.emptyMembers')}</p>{/each}
    {#if state.memberCursor}<button disabled={state.busy || !state.ready} onclick={() => controller.moreStaff()}>{i18n.t('staff.moreMembers')}</button>{/if}
    <h4>{i18n.t('staff.invitations')}</h4>
    {#each state.invitations as invitation (invitation.id)}
      <article>
        <p>{i18n.t(invitation.role === 'editor' ? 'staff.editor' : 'staff.viewer')} · {i18n.t(invitation.revokedAt ? 'staff.revoked' : invitation.consumedAt ? 'staff.used' : Date.parse(invitation.expiresAt) <= now ? 'staff.expired' : 'staff.offered')}</p>
        <p>{i18n.t('staff.expires', { date: i18n.date(new Date(invitation.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
        {#if !invitation.consumedAt && !invitation.revokedAt}
          <button disabled={state.busy || !state.ready} onclick={() => { revocation = invitation; removal = null; }}>{i18n.t('staff.revoke')}</button>
          {#if revocation?.id === invitation.id}<p>{i18n.t('staff.confirmRevokeText')}</p><button disabled={state.busy || !state.ready} onclick={revoke}>{i18n.t('staff.confirmRevoke')}</button><button onclick={() => { revocation = null; }}>{i18n.t('dealer.cancel')}</button>{/if}
        {/if}
      </article>
    {:else}<p>{i18n.t('staff.emptyInvitations')}</p>{/each}
    {#if state.invitationCursor}<button disabled={state.busy || !state.ready} onclick={() => controller.moreInvitations()}>{i18n.t('staff.moreInvitations')}</button>{/if}
    <form onsubmit={(event) => { event.preventDefault(); void controller.createInvitation(role, hours); }}>
      <fieldset disabled={!state.ready || state.busy || Boolean(state.issued)}>
        <legend>{i18n.t('staff.invite')}</legend>
        <label>{i18n.t('staff.role')}<select bind:value={role}><option value="viewer">{i18n.t('staff.viewer')}</option><option value="editor">{i18n.t('staff.editor')}</option></select></label>
        <label>{i18n.t('staff.expiryHours')}<input type="number" required min="1" max="168" step="1" bind:value={hours} /></label>
        <button type="submit">{i18n.t('staff.invite')}</button>
      </fieldset>
    </form>
  {/if}
</section>
<style>
  .shop-name{font-weight:650}h3{font-size:1.4rem}h4{margin:1.8rem 0 .7rem}article,aside{border:1px solid #bdc9c3;border-radius:.6rem;padding:1rem;margin:.75rem 0;overflow-wrap:anywhere}aside{background:#e5efe8}dl{margin:0}dt{font-size:.9rem;color:#52645e}dd{margin:.4rem 0}button,input,select,textarea{font:inherit;min-height:44px;box-sizing:border-box;border:1px solid #9caf9f;border-radius:.5rem;padding:.6rem;background:white;color:#183e32}button{cursor:pointer;margin:.25rem .4rem .25rem 0}button:disabled{opacity:.55;cursor:wait}label{display:flex;flex-direction:column;gap:.4rem;margin:.8rem 0}textarea{width:100%;resize:vertical}fieldset{border:0;padding:0;margin-top:1.5rem}legend{font-weight:650}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #246aab;outline-offset:2px}
</style>
