<script lang="ts">
  import { onMount } from 'svelte';
  import { createDealerApiClient, DealerClientError, type DealerProfile } from '@pianotechpros/api-client';
  import { createDealerDirectory, type SessionCredential } from '@pianotechpros/client-core';
  import type { MessageKey, Translator } from '@pianotechpros/i18n';

  export let accountId: string;
  export let apiURL: string;
  export let credential: SessionCredential;
  export let i18n: Translator;
  export let onSessionRejected: () => void;

  const directory = createDealerDirectory<DealerProfile, MessageKey>((error) => {
    if (error instanceof DealerClientError && error.status === 401) onSessionRejected();
    return error instanceof DealerClientError && error.code === 'not_found' ? 'dealer.detailFailed' : 'dealer.loadFailed';
  });
  let state = directory.snapshot();
  onMount(() => {
    const session = credential;
    const unsubscribe = directory.subscribe((next) => { state = next; });
    directory.replaceSession(accountId, createDealerApiClient(apiURL, () => Date.parse(session.expiresAt) > Date.now() ? session.token : null));
    void directory.refresh();
    return () => { unsubscribe(); directory.clear(); };
  });
</script>

<section class="directory" aria-labelledby="shops-heading">
  <header>
    <div><h2 id="shops-heading">{i18n.t('dealer.heading')}</h2><p>{i18n.t('dealer.intro')}</p></div>
    <button class="secondary" disabled={state.listLoading} onclick={() => directory.refresh()}>{i18n.t('dealer.refresh')}</button>
  </header>
  <div class="workspace">
    <nav aria-labelledby="shops-heading" aria-busy={state.listLoading}>
      {#each state.items as shop (shop.id)}
        <button class:selected={state.selectedId === shop.id} aria-pressed={state.selectedId === shop.id} onclick={() => directory.select(shop.id)}>{shop.name}</button>
      {/each}
      {#if state.listLoading}<p role="status">{i18n.t('common.loading')}</p>{/if}
      {#if state.listFailure}
        <p role="alert">{i18n.t(state.listFailure)}</p><button onclick={() => state.listFailureOperation === 'more' ? directory.loadMore() : directory.refresh()}>{i18n.t('dealer.retry')}</button>
      {:else if !state.listLoading && !state.items.length && !state.nextCursor}<p>{i18n.t('dealer.empty')}</p>{/if}
      {#if state.nextCursor}<button class="secondary" disabled={state.listLoading} onclick={() => directory.loadMore()}>{i18n.t('dealer.more')}</button>{/if}
    </nav>
    <div class="profile" aria-live="polite" aria-busy={state.detailLoading}>
      {#if state.detailLoading}<p role="status">{i18n.t('common.loading')}</p>
      {:else if state.detailFailure}<p role="alert">{i18n.t(state.detailFailure)}</p><button onclick={() => directory.select(state.selectedId)}>{i18n.t('dealer.retry')}</button>
      {:else if state.selected}
        {@const shop = state.selected}
        <h3>{shop.name}</h3>
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
</section>

<style>
  .directory{margin-top:2.5rem;border-top:1px solid #d8dcd8;padding-top:2rem;color:#182c28}header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.5rem}h2{margin:0;font-size:1.5rem}header p{color:#52645e;margin:.5rem 0}.workspace{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,2fr);gap:1.5rem}nav{display:flex;flex-direction:column;align-items:stretch;gap:.6rem}button{font:inherit;min-height:44px;padding:.75rem 1rem;text-align:left;border:1px solid #bdc9c3;border-radius:.65rem;background:white;color:#183e32;cursor:pointer}button.selected{background:#e5efe8;border-color:#2c644c;box-shadow:inset 3px 0 #2c644c}button.secondary{background:#f7f9f6}button:disabled{opacity:.55;cursor:wait}button:focus-visible{outline:3px solid #246aab;outline-offset:3px}.profile{background:#f7f9f6;border:1px solid #e0e6df;border-radius:1rem;padding:1.5rem;min-height:16rem;overflow-wrap:anywhere}h3{font-size:1.65rem;margin:0 0 .8rem}h4{margin:1.5rem 0 .6rem}.tagline{font-size:1.1rem;color:#52645e}.prose{white-space:pre-wrap;line-height:1.6}dl{display:grid;grid-template-columns:minmax(6rem,1fr) 2fr;gap:.65rem}dt{color:#52645e}dd{margin:0}.placeholder{color:#52645e}@media(max-width:640px){header{align-items:flex-start;flex-direction:column}.workspace{grid-template-columns:1fr}.profile{padding:1rem}dl{grid-template-columns:1fr;gap:.35rem}dd{margin-bottom:.6rem}}
</style>
