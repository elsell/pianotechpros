<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DealerClientError, type DealerProfile, type DealerProfileInput } from '@pianotechpros/api-client';
  import { createDealerCreation } from '@pianotechpros/client-core';
  import type { MessageKey, Translator } from '@pianotechpros/i18n';
  export let initial: DealerProfile | null = null;
  export let i18n: Translator;
  export let api: { get(id: string): Promise<DealerProfile>; create(input: DealerProfileInput, key: string): Promise<DealerProfile>; update(id: string, input: DealerProfileInput, revision: number): Promise<DealerProfile> };
  export let onSaved: (profile: DealerProfile) => void;
  export let onCancel: () => void;
  let mounted = true;
  onDestroy(() => { mounted = false; });
  const original = initial;
  let baseRevision = original?.revision ?? 0;
  let latest: DealerProfile | null = null;
  let conflict = false;
  const optional = [
    { key: 'phone', label: 'dealer.phone', max: 32 }, { key: 'website_url', label: 'dealer.website', max: 2048 },
    { key: 'tagline', label: 'dealer.tagline', max: 240 }, { key: 'description', label: 'dealer.description', max: 4000, multiline: true },
    { key: 'street_address_1', label: 'dealer.street1', max: 200 }, { key: 'street_address_2', label: 'dealer.street2', max: 200 },
    { key: 'city', label: 'dealer.city', max: 100 }, { key: 'region', label: 'dealer.region', max: 64 }, { key: 'postal_code', label: 'dealer.postal', max: 20 },
    { key: 'banner_alt_text', label: 'dealer.bannerAlt', max: 240 },
    { key: 'appointment_note', label: 'dealer.appointment', max: 2000, multiline: true }, { key: 'delivery_note', label: 'dealer.delivery', max: 2000, multiline: true },
    { key: 'warranty_note', label: 'dealer.warranty', max: 2000, multiline: true }, { key: 'service_note', label: 'dealer.service', max: 2000, multiline: true },
  ] as const;
  let draft: DealerProfileInput = { name: original?.name ?? '', slug: original?.slug ?? '', email: original?.email ?? '', accent_color: original?.accent_color ?? '#245b43', showroom_published: original?.showroom_published ?? false };
  for (const field of optional) draft[field.key] = original?.[field.key] ?? '';
  let saving = false;
  let uncertain = false;
  let failure: MessageKey | null = null;
  const creation = createDealerCreation<DealerProfileInput, DealerProfile>({
    key: () => crypto.randomUUID(),
    create: (input, key) => api.create(input, key),
    rejectedBeforeCreation: (error) => error instanceof DealerClientError && ['bad_request', 'validation_failed', 'conflict'].includes(error.code),
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving || conflict) return;
    saving = true; failure = null;
    try {
      const saved = original ? await api.update(original.id, { ...draft }, baseRevision) : await creation.submit(draft);
      if (mounted) onSaved(saved);
    } catch (error) {
      if (!mounted) return;
      conflict = Boolean(original && error instanceof DealerClientError && error.code === 'conflict');
      latest = null;
      uncertain = !original && creation.pending();
      failure = error instanceof DealerClientError && error.code === 'conflict' ? (original ? 'dealer.editConflict' : 'dealer.createConflict')
        : error instanceof DealerClientError && ['bad_request', 'validation_failed'].includes(error.code) ? 'dealer.invalid'
        : error instanceof DealerClientError && ['not_found', 'forbidden'].includes(error.code) ? 'dealer.detailFailed' : 'dealer.saveFailed';
    } finally { if (mounted) saving = false; }
  }
  async function reviewCurrent() {
    if (!original || saving) return;
    saving = true;
    try { const profile = await api.get(original.id); if (mounted) latest = profile; }
    catch { if (mounted) failure = 'dealer.saveFailed'; }
    finally { if (mounted) saving = false; }
  }
  const comparisonFields = [{ key: 'name', label: 'dealer.name' }, { key: 'slug', label: 'dealer.slug' }, { key: 'email', label: 'dealer.email' }, ...optional, { key: 'accent_color', label: 'dealer.accent' }, { key: 'showroom_published', label: 'dealer.showroom' }] as const;
  function display(value: string | boolean | undefined) { return typeof value === 'boolean' ? i18n.t(value ? 'dealer.published' : 'dealer.private') : value || i18n.t('dealer.notSet'); }
</script>
<form onsubmit={submit} aria-busy={saving}>
  <h3>{i18n.t(original ? 'dealer.edit' : 'dealer.create')}</h3>
  {#if original}<p>{i18n.t('dealer.ownerOnly')}</p>{/if}
  <fieldset disabled={saving || uncertain}>
    <legend>{i18n.t('dealer.contact')}</legend>
    <label>{i18n.t('dealer.name')}<input required maxlength="200" bind:value={draft.name} autocomplete="organization" /></label>
    <label>{i18n.t('dealer.slug')}<input required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" bind:value={draft.slug} aria-describedby="slug-hint" autocapitalize="none" spellcheck={false} /></label>
    <p id="slug-hint" class="hint">{i18n.t('dealer.slugHint')}</p>
    <label>{i18n.t('dealer.email')}<input type="email" required maxlength="320" bind:value={draft.email} autocomplete="email" /></label>
    {#each optional.slice(0, 4) as field}
      <label>{i18n.t(field.label)}{#if 'multiline' in field}<textarea maxlength={field.max} rows="4" bind:value={draft[field.key]}></textarea>{:else}<input type={field.key === 'phone' ? 'tel' : field.key === 'website_url' ? 'url' : 'text'} maxlength={field.max} bind:value={draft[field.key]} />{/if}</label>
    {/each}
  </fieldset>
  <fieldset disabled={saving || uncertain}>
    <legend>{i18n.t('dealer.address')}</legend>
    {#each optional.slice(4, 9) as field}<label>{i18n.t(field.label)}<input maxlength={field.max} bind:value={draft[field.key]} /></label>{/each}
  </fieldset>
  <fieldset disabled={saving || uncertain}>
    <legend>{i18n.t('dealer.showroom')}</legend>
    <label>{i18n.t('dealer.accent')}<input type="color" bind:value={draft.accent_color} /></label>
    <label>{i18n.t('dealer.bannerAlt')}<input maxlength="240" bind:value={draft.banner_alt_text} /></label>
    <label class="toggle"><input type="checkbox" bind:checked={draft.showroom_published} />{i18n.t('dealer.enableShowroom')}</label>
  </fieldset>
  <fieldset disabled={saving || uncertain}>
    <legend>{i18n.t('dealer.notes')}</legend>
    {#each optional.slice(10) as field}<label>{i18n.t(field.label)}<textarea maxlength={field.max} rows="3" bind:value={draft[field.key]}></textarea></label>{/each}
  </fieldset>
  {#if failure}<p role="alert">{i18n.t(failure)}</p>{/if}
  {#if uncertain}<p role="status">{i18n.t('dealer.pendingCreation')}</p>{/if}
  {#if conflict}
    <button type="button" disabled={saving} onclick={reviewCurrent}>{i18n.t('dealer.reviewCurrent')}</button>
    {#if latest}
      <section aria-label={i18n.t('dealer.reviewCurrent')}>
        {#each comparisonFields as field}
          {#if (latest[field.key] ?? '') !== (draft[field.key] ?? '')}
            <h4>{i18n.t(field.label)}</h4><dl><dt>{i18n.t('dealer.currentValue')}</dt><dd>{display(latest[field.key])}</dd><dt>{i18n.t('dealer.yourValue')}</dt><dd>{display(draft[field.key])}</dd></dl>
          {/if}
        {/each}
        <button type="button" onclick={() => { baseRevision = latest!.revision; latest = null; conflict = false; failure = null; }}>{i18n.t('dealer.keepEdits')}</button>
      </section>
    {/if}
  {/if}
  <footer><button type="submit" disabled={saving || conflict}>{i18n.t(saving ? 'dealer.saving' : uncertain ? 'dealer.retry' : original ? 'dealer.save' : 'dealer.create')}</button><button type="button" disabled={saving || uncertain} onclick={onCancel}>{i18n.t('dealer.cancel')}</button></footer>
</form>
<style>
  h3{margin:0 0 1rem;font-size:1.5rem}fieldset{border:0;border-top:1px solid #cbd6cf;margin:1.5rem 0;padding:1rem 0 0}legend{font-weight:650;padding-right:.75rem}label{display:flex;flex-direction:column;gap:.4rem;margin:.85rem 0}input,textarea,button{font:inherit}input,textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #9caf9f;border-radius:.45rem;background:white;color:#182c28;padding:.65rem}input[type=color]{width:5rem}input[type=checkbox]{width:1.25rem;min-height:1.25rem}.toggle{flex-direction:row;align-items:center}.hint{font-size:.9rem;color:#52645e}footer{display:flex;gap:.75rem;background:#f7f9f6;padding:1rem 0}button{min-height:44px;border:1px solid #9caf9f;border-radius:.5rem;padding:.65rem 1rem;background:white;color:#183e32;cursor:pointer}button[type=submit]{background:#245b43;color:white}button:disabled{opacity:.6;cursor:wait}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #246aab;outline-offset:2px}textarea{resize:vertical}
</style>
