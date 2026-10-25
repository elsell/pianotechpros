<script lang="ts">
 import {publicPianoPath} from '@pianotechpros/client-core';
 import {onMount} from 'svelte';
 import {createTranslator,type MessageKey} from '@pianotechpros/i18n';
 import InquiryForm from '#lib/inquiry/InquiryForm.svelte';
 import ShowroomFrame from '#lib/showroom/ShowroomFrame.svelte';
 import type {PageData} from './$types';
 export let data:PageData;
 let selected=0;
 let ready=false;
 onMount(()=>{ready=true;});
 let currentID='';
 $: i18n=createTranslator([data.locale]);
 $: piano=data.piano;
 $: profile=data.profile;
 $: base='/showrooms/'+encodeURIComponent(profile.slug);
 $: photoBase=base+'/pianos/'+encodeURIComponent(piano.id)+'/photos/';
 $: if(piano.id+':'+piano.publication_revision!==currentID){currentID=piano.id+':'+piano.publication_revision;selected=0;}
 function move(delta:number){selected=(selected+delta+piano.photos.length)%piano.photos.length;}
</script>
<svelte:head><title>{piano.title} · {profile.name}</title><meta name="description" content={piano.description.slice(0,160)||piano.title} /></svelte:head>
<ShowroomFrame {profile} {i18n}>
 <a class="back" href={base}><span aria-hidden="true">← </span>{i18n.t('showroom.back')}</a>
 <div class="listing"><section class="gallery" aria-label={i18n.t('showroom.photoPosition',{number:selected+1,total:piano.photos.length})}>
  <div class="hero"><img src={photoBase+encodeURIComponent(piano.photos[selected].id)} alt={piano.photos[selected].alt_text||i18n.t('showroom.photo',{title:piano.title,number:selected+1})} /></div>
  {#if piano.photos.length>1}<div class="gallery-controls"><button disabled={!ready} on:click={()=>move(-1)} aria-label={i18n.t('showroom.previousPhoto')}>←</button><p aria-live="polite">{i18n.t('showroom.photoPosition',{number:selected+1,total:piano.photos.length})}</p><button disabled={!ready} on:click={()=>move(1)} aria-label={i18n.t('showroom.nextPhoto')}>→</button></div>
   <div class="thumbnails">{#each piano.photos as photo,index}<button disabled={!ready} on:click={()=>selected=index} aria-pressed={selected===index} aria-label={i18n.t('showroom.photo',{title:piano.title,number:index+1})}><img src={photoBase+encodeURIComponent(photo.id)} alt="" loading="lazy" /></button>{/each}</div>
  {/if}
 </section><section class="summary"><p class="status">{i18n.t(('inventory.status.'+piano.status) as MessageKey)}</p><h1>{piano.title}</h1><p class="price">{piano.price?i18n.money(piano.price.minor_units,piano.price.currency):i18n.t('showroom.requestPrice')}</p><p class="form">{i18n.t(('inventory.form.'+piano.form) as MessageKey)}</p>
  <div class="contact">{#if profile.phone}<a class="primary" href={'tel:'+profile.phone.replace(/[^+0-9]/g,'')}>{i18n.t('showroom.call')}</a>{/if}<a class="secondary" href={'mailto:'+encodeURIComponent(profile.email)+'?subject='+encodeURIComponent(piano.title)}>{i18n.t('showroom.email')}</a></div>
  <h2>{i18n.t('showroom.details')}</h2>{#if piano.description}<p class="description">{piano.description}</p>{/if}
  <dl>{#each [{key:'showroom.stock' as const,value:piano.stock_number},{key:'showroom.make' as const,value:piano.make},{key:'showroom.model' as const,value:piano.model},{key:'showroom.finish' as const,value:piano.finish},{key:'showroom.size' as const,value:piano.size}] as fact}{#if fact.value}<div><dt>{i18n.t(fact.key)}</dt><dd>{fact.value}</dd></div>{/if}{/each}</dl>
 </section></div>
{#key profile.slug+':'+piano.id}<InquiryForm apiURL={data.config.apiURL} slug={profile.slug} pianoID={piano.id} config={data.inquiryConfig} {i18n} />{/key}
{#if data.related.length||data.relatedUnavailable}<section class="related" aria-labelledby="related-heading">
 <h2 id="related-heading">{i18n.t('showroom.related')}</h2>
 {#if data.relatedUnavailable}<p>{i18n.t('showroom.relatedUnavailable')}</p><a href={base}>{i18n.t('showroom.back')}</a>
 {:else}<div class="related-grid">{#each data.related as other}<article><a href={publicPianoPath(profile.slug,other)}>
  <img src={base+'/pianos/'+encodeURIComponent(other.id)+'/photos/'+encodeURIComponent(other.photos[0].id)} alt={other.photos[0].alt_text||i18n.t('showroom.photo',{title:other.title,number:1})} loading="lazy" />
  <h3>{other.title}</h3><p>{other.price?i18n.money(other.price.minor_units,other.price.currency):i18n.t('showroom.requestPrice')}</p>
 </a></article>{/each}</div>{/if}
</section>{/if}
</ShowroomFrame>
<style>
 .related{margin-top:3rem;padding-top:2rem;border-top:1px solid #d8ddd3}.related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:1.5rem}.related-grid a{display:block;text-decoration:none}.related-grid img{display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#e3e6dc}.related-grid h3{font:400 1.4rem Georgia,serif;margin:1rem 0 .5rem}.related-grid p{margin:.5rem 0}

 a{color:#245346}.back{display:inline-block;margin:1rem 0 2rem}.listing{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:3rem}.hero{aspect-ratio:4/3;background:#e3e6dc;border-radius:5px;overflow:hidden}.hero img{width:100%;height:100%;object-fit:contain}.status{color:#526056;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;margin-top:0}h1{font:400 clamp(2rem,4vw,3rem)/1.15 Georgia,serif;margin:.5rem 0 1rem}.price{font-size:1.35rem;font-weight:600;margin-bottom:.2rem}.form{color:#637265}.contact{display:flex;gap:.8rem;flex-wrap:wrap;margin:2rem 0}.contact a{display:inline-block;border:1px solid #245346;padding:.8rem 1rem;border-radius:4px;text-decoration:none}.primary{background:#245346;color:white}h2{font:400 1.5rem Georgia,serif}.description{white-space:pre-line}dl div{display:flex;gap:1rem;justify-content:space-between;padding:.7rem 0;border-bottom:1px solid #d8ddd3}dt{color:#637265}dd{margin:0;text-align:right}.gallery-controls{display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:.8rem}.gallery-controls button{width:44px;height:44px;border:1px solid #85988b;background:transparent;border-radius:50%;cursor:pointer;font-size:1.2rem}.thumbnails{display:flex;gap:.6rem;overflow-x:auto;padding:.4rem}.thumbnails button{flex:0 0 80px;border:2px solid transparent;border-radius:4px;padding:2px;background:none;cursor:pointer}.thumbnails button[aria-pressed=true]{border-color:#245346}.thumbnails img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}@media(max-width:750px){.listing{grid-template-columns:1fr;gap:2rem}.contact a{flex:1;text-align:center}.back{margin-bottom:1.5rem}}
</style>
