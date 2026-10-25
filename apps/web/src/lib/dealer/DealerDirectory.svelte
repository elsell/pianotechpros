<script lang="ts">
  import InquiryInbox from '../inquiry/InquiryInbox.svelte';
  import InventoryBrowser from '../inventory/InventoryBrowser.svelte';
  import DealerJoin from './DealerJoin.svelte';
  import DealerStaff from './DealerStaff.svelte';
  import DealerProfileForm from './DealerProfileForm.svelte';
  import { onMount } from 'svelte';
  import { createDealerApiClient, DealerClientError, type DealerProfile } from '@pianotechpros/api-client';
  import { createDealerDirectory, type SessionCredential, type DealerInvitationCode } from '@pianotechpros/client-core';
  import type { MessageKey, Translator } from '@pianotechpros/i18n';

  export let accountId: string;
  export let apiURL: string;
  export let credential: SessionCredential;
  export let i18n: Translator;
  export let onSessionRejected: () => void;

  const directory = createDealerDirectory<DealerProfile, MessageKey>((error) => {
    return error instanceof DealerClientError && error.code === 'not_found' ? 'dealer.detailFailed' : 'dealer.loadFailed';
  });
  let state = directory.snapshot();
  let form: { initial: DealerProfile | null } | null = null;
  let savedNotice = false;
  let active = true;
  let staffShop: string | null = null;
  let inventoryShop: string | null = null;
  let inboxShop: string | null = null;
  let joinOpen = false;
  const joinAPI = {
    preview: (input: DealerInvitationCode) => withCredential((api) => api.previewInvitation(input.dealerID, input.invitationID, input.token)),
    accept: (input: DealerInvitationCode) => withCredential((api) => api.acceptInvitation(input.dealerID, input.invitationID, input.token)),
    access: (id: string) => withCredential((api) => api.get(id)),
  };
  async function joined(id: string) { joinOpen = false; await directory.refresh(); await directory.select(id); }

  function staffAPI(id: string) {
    return {
      listStaff: (cursor: string | undefined = undefined) => withCredential((api) => api.listStaff(id, cursor)),
      listInvitations: (cursor: string | undefined = undefined) => withCredential((api) => api.listInvitations(id, cursor)),
      changeRole: (userID: string, role: 'editor' | 'viewer', revision: number) => withCredential((api) => api.changeStaffRole(id, userID, role, revision)),
      remove: (userID: string, revision: number) => withCredential((api) => api.removeStaff(id, userID, revision)),
      createInvitation: (role: 'editor' | 'viewer', hours: number) => withCredential((api) => api.createInvitation(id, role, hours)),
      revokeInvitation: (invitationID: string) => withCredential((api) => api.revokeInvitation(id, invitationID)),
    };
  }
  async function withCredential<T>(operation: (api: ReturnType<typeof createDealerApiClient>) => Promise<T>): Promise<T> {
    const session = credential;
    try { return await operation(createDealerApiClient(apiURL, () => Date.parse(session.expiresAt) > Date.now() ? session.token : null)); }
    catch (error) {
      if (error instanceof DealerClientError && error.status === 401 && active && session.token === credential.token) onSessionRejected();
      throw error;
    }
  }
  const formAPI = {
    get: (id: string) => withCredential((api) => api.get(id)),
    create: (input: Parameters<ReturnType<typeof createDealerApiClient>['create']>[0], key: string) => withCredential((api) => api.create(input, key)),
    update: (id: string, input: Parameters<ReturnType<typeof createDealerApiClient>['update']>[1], revision: number) => withCredential((api) => api.update(id, input, revision)),
  };
  async function saved(profile: DealerProfile) {
    form = null; savedNotice = true;
    await directory.refresh();
    await directory.select(profile.id);
  }
  onMount(() => {
    const unsubscribe = directory.subscribe((next) => { state = next; });
    directory.replaceSession(accountId, { list: (cursor) => withCredential((api) => api.list(cursor)), get: (id) => withCredential((api) => api.get(id)) });
    void directory.refresh();
    return () => { active = false; unsubscribe(); directory.clear(); };
  });
</script>

<section class="directory" aria-labelledby={inboxShop ? 'inbox-heading' : inventoryShop ? 'inventory-heading' : 'shops-heading'}>
  {#if inboxShop}{#key JSON.stringify([accountId,inboxShop])}<InquiryInbox {accountId} dealerID={inboxShop} {credential} {apiURL} {i18n} {onSessionRejected} onBack={()=>{inboxShop=null;}} />{/key}
  {:else if inventoryShop}{#key inventoryShop}<InventoryBrowser {accountId} dealerID={inventoryShop} {credential} {apiURL} {i18n} {onSessionRejected} onBack={() => { const id = inventoryShop; inventoryShop = null; void directory.select(id); }} />{/key}
  {:else}
  <header>
    <div><h2 id="shops-heading">{i18n.t('dealer.heading')}</h2><p>{i18n.t('dealer.intro')}</p></div>
    <button disabled={Boolean(form) || Boolean(staffShop) || Boolean(inventoryShop) || joinOpen} onclick={() => { savedNotice = false; joinOpen = true; }}>{i18n.t('staff.join')}</button>
    <button disabled={Boolean(form) || Boolean(staffShop) || Boolean(inventoryShop) || joinOpen} onclick={() => { savedNotice = false; form = { initial: null }; }}>{i18n.t('dealer.create')}</button>
    <button class="secondary" disabled={state.listLoading || Boolean(form) || Boolean(staffShop) || Boolean(inventoryShop) || joinOpen} onclick={() => directory.refresh()}>{i18n.t('dealer.refresh')}</button>
  </header>
  <div class="workspace">
    <nav aria-labelledby="shops-heading" aria-busy={state.listLoading}>
      {#each state.items as shop (shop.id)}
        <button disabled={Boolean(form) || Boolean(staffShop) || Boolean(inventoryShop) || joinOpen} class:selected={state.selectedId === shop.id} aria-pressed={state.selectedId === shop.id} onclick={() => directory.select(shop.id)}>{shop.name}</button>
      {/each}
      {#if state.listLoading}<p role="status">{i18n.t('common.loading')}</p>{/if}
      {#if state.listFailure}
        <p role="alert">{i18n.t(state.listFailure)}</p><button onclick={() => state.listFailureOperation === 'more' ? directory.loadMore() : directory.refresh()}>{i18n.t('dealer.retry')}</button>
      {:else if !state.listLoading && !state.items.length && !state.nextCursor}<p>{i18n.t('dealer.empty')}</p>{/if}
      {#if state.nextCursor}<button class="secondary" disabled={state.listLoading} onclick={() => directory.loadMore()}>{i18n.t('dealer.more')}</button>{/if}
    </nav>
    <div class="profile" aria-live="polite" aria-busy={state.detailLoading}>
      {#if savedNotice}<p role="status">{i18n.t('dealer.saved')}</p>{/if}
      {#if joinOpen}<DealerJoin {accountId} api={joinAPI} {i18n} onCancel={() => { joinOpen = false; }} onJoined={joined} />
      {:else if staffShop}{#key staffShop}<DealerStaff shopName={state.selected?.name ?? ''} api={staffAPI(staffShop)} {i18n} onBack={() => { staffShop = null; }} />{/key}
      {:else if form}<DealerProfileForm initial={form.initial} {i18n} api={formAPI} onSaved={saved} onCancel={() => { form = null; }} />
      {:else if state.detailLoading}<p role="status">{i18n.t('common.loading')}</p>
      {:else if state.detailFailure}<p role="alert">{i18n.t(state.detailFailure)}</p><button onclick={() => directory.select(state.selectedId)}>{i18n.t('dealer.retry')}</button>
      {:else if state.selected}
        {@const shop = state.selected}
        <h3>{shop.name}</h3>
        <button onclick={()=>{savedNotice=false;inboxShop=shop.id;}}>{i18n.t('inbox.heading')}</button>
        <button onclick={() => { savedNotice = false; inventoryShop = shop.id; }}>{i18n.t('inventory.browse')}</button>
        <button onclick={() => { savedNotice = false; staffShop = shop.id; }}>{i18n.t('staff.manage')}</button>
        <button onclick={() => { savedNotice = false; form = { initial: shop }; }}>{i18n.t('dealer.edit')}</button>
        {#if shop.tagline}<p class="tagline">{shop.tagline}</p>{/if}
        {#if shop.description}<p class="prose">{shop.description}</p>{/if}
        <h4>{i18n.t('dealer.contact')}</h4>
        <dl>
          <dt>{i18n.t('dealer.email')}</dt><dd>{shop.email}</dd>
          {#if shop.phone}<dt>{i18n.t('dealer.phone')}</dt><dd>{shop.phone}</dd>{/if}
          {#if shop.website_url}<dt>{i18n.t('dealer.website')}</dt><dd>{shop.website_url}</dd>{/if}
          {#if shop.street_address_1 || shop.street_address_2 || shop.city || shop.region || shop.postal_code}
            <dt>{i18n.t('dealer.address')}</dt><dd>{#each [shop.street_address_1, shop.street_address_2, shop.city, shop.region, shop.postal_code].filter(Boolean) as line}<div>{line}</div>{/each}</dd>
          {/if}
        </dl>
        <h4>{i18n.t('dealer.showroom')}</h4>
        <p>{i18n.t(shop.showroom_published ? 'dealer.published' : 'dealer.private')}</p>
        {#each [{ key: 'dealer.appointment' as const, value: shop.appointment_note }, { key: 'dealer.delivery' as const, value: shop.delivery_note }, { key: 'dealer.warranty' as const, value: shop.warranty_note }, { key: 'dealer.service' as const, value: shop.service_note }] as note}
          {#if note.value}<h4>{i18n.t(note.key)}</h4><p class="prose">{note.value}</p>{/if}
        {/each}
      {:else}<p class="placeholder">{i18n.t('dealer.select')}</p>{/if}
    </div>
  </div>
  {/if}
</section>

<style>
  .directory{margin-top:2.5rem;border-top:1px solid #d8dcd8;padding-top:2rem;color:#182c28}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.5rem}h2{margin:0;font-size:1.5rem}header p{color:#52645e;margin:.5rem 0}.workspace{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,2fr);gap:1.5rem}nav{display:flex;flex-direction:column;align-items:stretch;gap:.6rem}button{font:inherit;min-height:44px;padding:.75rem 1rem;text-align:left;border:1px solid #bdc9c3;border-radius:.65rem;background:white;color:#183e32;cursor:pointer}button.selected{background:#e5efe8;border-color:#2c644c;box-shadow:inset 3px 0 #2c644c}button.secondary{background:#f7f9f6}button:disabled{opacity:.55;cursor:wait}button:focus-visible{outline:3px solid #246aab;outline-offset:3px}.profile{background:#f7f9f6;border:1px solid #e0e6df;border-radius:1rem;padding:1.5rem;min-height:16rem;overflow-wrap:anywhere}h3{font-size:1.65rem;margin:0 0 .8rem}h4{margin:1.5rem 0 .6rem}.tagline{font-size:1.1rem;color:#52645e}.prose{white-space:pre-wrap;line-height:1.6}dl{display:grid;grid-template-columns:minmax(6rem,1fr) 2fr;gap:.65rem}dt{color:#52645e}dd{margin:0}.placeholder{color:#52645e}@media(max-width:640px){header{align-items:flex-start;flex-direction:column}.workspace{grid-template-columns:1fr}.profile{padding:1rem}dl{grid-template-columns:1fr;gap:.35rem}dd{margin-bottom:.6rem}}
</style>
