<script lang="ts">
 import type {PublicShowroomProfile} from '@pianotechpros/api-client';
 import type {Translator} from '@pianotechpros/i18n';
 export let profile:PublicShowroomProfile;
 export let i18n:Translator;
</script>
<div class="showroom">
 <header><a class="identity" href={'/showrooms/'+encodeURIComponent(profile.slug)}>{profile.name}</a><a class="contact" href={'mailto:'+encodeURIComponent(profile.email)}>{i18n.t('showroom.email')}</a></header>
 <main><slot /></main>
 <footer>
  <div><h2>{profile.name}</h2>{#if profile.tagline}<p>{profile.tagline}</p>{/if}<address>{[profile.street_address_1,profile.street_address_2,profile.city,profile.region,profile.postal_code].filter(Boolean).join(', ')}</address>
   <nav aria-label={i18n.t('showroom.visit')}>{#if profile.phone}<a href={'tel:'+profile.phone.replace(/[^+0-9]/g,'')}>{i18n.t('showroom.call')}</a>{/if}<a href={'mailto:'+encodeURIComponent(profile.email)}>{i18n.t('showroom.email')}</a>{#if profile.website_url}<a href={profile.website_url} rel="noopener noreferrer">{i18n.t('showroom.website')}</a>{/if}</nav>
  </div>
  <div class="notes">{#each [{key:'showroom.visit' as const,value:profile.appointment_note},{key:'showroom.delivery' as const,value:profile.delivery_note},{key:'showroom.warranty' as const,value:profile.warranty_note},{key:'showroom.service' as const,value:profile.service_note}] as note}{#if note.value}<section><h3>{i18n.t(note.key)}</h3><p>{note.value}</p></section>{/if}{/each}</div>
 </footer>
</div>
<style>
 :global(body){margin:0;background:#f7f5ef;color:#242d28}.showroom{font-family:system-ui,sans-serif;line-height:1.6}header,main,footer{max-width:1160px;margin:auto;padding:1.5rem 2rem}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px solid #d8ddd3}.identity{font:600 1.4rem Georgia,serif;text-decoration:none}.contact{font-size:.9rem}a{color:#245346}footer{margin-top:4rem;border-top:1px solid #d8ddd3;display:grid;grid-template-columns:1fr 1fr;gap:3rem;padding-top:3rem;padding-bottom:4rem}footer p{white-space:pre-line}address{font-style:normal;color:#58645a}nav{display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem}.notes{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}h2,h3{font-family:Georgia,serif;margin-top:0}h3{font-size:1.1rem}:global(.showroom a:focus-visible),:global(.showroom button:focus-visible),:global(.showroom input:focus-visible),:global(.showroom select:focus-visible){outline:3px solid #ab6525;outline-offset:4px}@media(max-width:650px){header,main,footer{padding-left:1.2rem;padding-right:1.2rem}footer{grid-template-columns:1fr}.contact{max-width:8rem}.notes{gap:1rem}}
</style>
