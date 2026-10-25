<script lang="ts">
 import {createTranslator,type MessageKey} from '@pianotechpros/i18n';
 import {inventoryForms,inventoryCurrencies,publicPianoPath} from '@pianotechpros/client-core';
 import ShowroomFrame from '#lib/showroom/ShowroomFrame.svelte';
 import type {PageData} from './$types';
 export let data:PageData;
 $: i18n=createTranslator([data.locale]);
 $: profile=data.page.profile;
 $: base='/showrooms/'+encodeURIComponent(profile.slug);
 $: filtered=Object.entries(data.fields).some(([key,value])=>key!=='cursor'&&!!value);
</script>
<svelte:head><title>{profile.name} · {i18n.t('showroom.inventory')}</title><meta name="description" content={profile.tagline||profile.description.slice(0,160)} /></svelte:head>
<ShowroomFrame {profile} {i18n}>
 <section class="intro"><p class="eyebrow">{i18n.t('showroom.title')}</p><h1>{profile.tagline||i18n.t('showroom.inventory')}</h1>{#if profile.description}<p class="description">{profile.description}</p>{/if}</section>
 <details class="filters" open={filtered}><summary>{i18n.t('showroom.filters')}</summary>
  <form method="GET" action={base}>
   <label class="search">{i18n.t('showroom.search')}<input name="search" type="search" maxlength="120" value={data.fields.search??''} /></label>
   <label>{i18n.t('showroom.form')}<select aria-label={i18n.t('showroom.form')} name="form" value={data.fields.form??''}><option value="">{i18n.t('showroom.anyType')}</option>{#each inventoryForms.filter(Boolean) as form}<option value={form}>{i18n.t(('inventory.form.'+form) as MessageKey)}</option>{/each}</select></label>
   <label>{i18n.t('showroom.availability')}<select aria-label={i18n.t('showroom.availability')} name="availability" value={data.fields.availability??''}><option value="">{i18n.t('showroom.available')}</option><option value="all">{i18n.t('showroom.all')}</option>{#each ['available','reserved','sold'] as status}<option value={status}>{i18n.t(('inventory.status.'+status) as MessageKey)}</option>{/each}</select></label>
   <label>{i18n.t('showroom.currency')}<select aria-label={i18n.t('showroom.currency')} name="currency" value={data.fields.currency??''}><option value="">{i18n.t('showroom.anyCurrency')}</option>{#each inventoryCurrencies as currency}<option value={currency}>{currency}</option>{/each}</select></label>
   <label>{i18n.t('showroom.minimum')}<input name="minimum" inputmode="decimal" maxlength="24" value={data.fields.minimum??''} aria-describedby="price-help" /></label>
   <label>{i18n.t('showroom.maximum')}<input name="maximum" inputmode="decimal" maxlength="24" value={data.fields.maximum??''} aria-describedby="price-help" /></label>
   <p id="price-help">{i18n.t('showroom.priceHelp')}</p><div class="actions"><button type="submit">{i18n.t('showroom.apply')}</button><a href={base}>{i18n.t('showroom.clear')}</a></div>
  </form>
 </details>
 <section aria-label={i18n.t('showroom.inventory')}>
  {#if data.page.pianos.length===0}<p class="empty">{i18n.t('showroom.empty')}</p><a href={base}>{i18n.t('showroom.clear')}</a>{:else}
   <div class="grid">{#each data.page.pianos as piano,index}<article><a href={publicPianoPath(profile.slug,piano)}>
    <div class="cover"><img src={base+'/pianos/'+encodeURIComponent(piano.id)+'/photos/'+encodeURIComponent(piano.photos[0].id)} alt={piano.photos[0].alt_text||i18n.t('showroom.photo',{title:piano.title,number:1})} loading={index===0?'eager':'lazy'} /></div>
    <div class="card-copy"><span class="status">{i18n.t(('inventory.status.'+piano.status) as MessageKey)}</span><h2>{piano.title}</h2><p class="price">{piano.price?i18n.money(piano.price.minor_units,piano.price.currency):i18n.t('showroom.requestPrice')}</p><p class="kind">{i18n.t(('inventory.form.'+piano.form) as MessageKey)}</p></div>
   </a></article>{/each}</div>
  {/if}
  {#if data.nextHref}<div class="next"><a href={data.nextHref}>{i18n.t('showroom.next')} <span aria-hidden="true">→</span></a></div>{/if}
 </section>
</ShowroomFrame>
<style>
 .intro{max-width:760px;padding:3rem 0 2.5rem}.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:.75rem;color:#596d5e}h1{font:400 clamp(2.3rem,5vw,4rem)/1.12 Georgia,serif;margin:.7rem 0 1.2rem}.description{font-size:1.1rem;white-space:pre-line;color:#526056;max-width:65ch}.filters{border-top:1px solid #d4d9cf;border-bottom:1px solid #d4d9cf;margin-bottom:2rem;padding:1rem 0}summary{cursor:pointer;font-weight:600}form{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.5rem 0 .5rem}label{display:flex;flex-direction:column;gap:.35rem;font-size:.85rem;font-weight:600}input,select{box-sizing:border-box;width:100%;border:1px solid #85988b;border-radius:4px;background:#fff;padding:.75rem;font:inherit;color:inherit}#price-help{grid-column:1/-1;font-size:.85rem;color:#526056;margin:0}.actions{grid-column:1/-1;display:flex;gap:1.5rem;align-items:center}button{border:0;border-radius:4px;background:#245346;color:white;padding:.85rem 1.4rem;font:inherit;cursor:pointer}a{color:#245346}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2rem}article a{display:block;color:inherit;text-decoration:none}article a:hover h2{text-decoration:underline}.cover{aspect-ratio:4/3;background:#e3e6dc;overflow:hidden;border-radius:5px}img{width:100%;height:100%;object-fit:cover}.card-copy{padding:1rem 0}.status{font-size:.75rem;letter-spacing:.05em;color:#526056}h2{font:400 1.55rem/1.25 Georgia,serif;margin:.4rem 0}.price{font-weight:600;margin:.7rem 0 .2rem}.kind{font-size:.85rem;color:#647065;margin:0}.next{text-align:center;margin:3rem 0}.next a{display:inline-block;border:1px solid #245346;padding:.9rem 2rem;border-radius:4px}.empty{padding-top:2rem}@media(max-width:850px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.intro{padding-top:2rem}.grid{grid-template-columns:1fr;gap:1.3rem}form{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}}
</style>
