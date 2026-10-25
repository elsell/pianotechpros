<script lang="ts">
 import {onMount,onDestroy} from 'svelte';
 import {sharePublicLink,type PublicSharingPort} from '@pianotechpros/client-core';
 import type {Translator} from '@pianotechpros/i18n';
 import {browserPublicSharing} from '../browser-events';
 export let url:string|null;export let title:string;export let i18n:Translator;
 let port:PublicSharingPort|null=null,busy=false,active=true;
 let outcome:'shared'|'copied'|'failed'|null=null;
 onMount(()=>{port=browserPublicSharing();});onDestroy(()=>{active=false;});
 async function share(){
  if(!url||!port||busy)return;const selected=url;busy=true;outcome=null;
  try{const result=await sharePublicLink({url:selected,title},port);if(active&&url===selected)outcome=result==='cancelled'?null:result;}
  catch{if(active&&url===selected)outcome='failed';}
  finally{if(active&&url===selected)busy=false;}
 }
</script>
<div class="public-share">
 {#if url}<button type="button" disabled={!port||busy} onclick={()=>void share()}>{i18n.t(port?.share?'showroom.sharing.share':'showroom.sharing.copyLink')}</button>
 {#if outcome}<p aria-live="polite">{i18n.t(outcome==='failed'?'showroom.sharing.failed':outcome==='copied'?'showroom.sharing.copied':'showroom.sharing.shared')}</p>{/if}
 {#if outcome==='failed'}<label>{i18n.t('showroom.sharing.link')}<input readonly value={url} onclick={event=>event.currentTarget.select()} /></label>{/if}
 {:else}<p>{i18n.t('showroom.sharing.unavailable')}</p>{/if}
</div>
<style>
 .public-share{margin:1rem 0;color:#526056}.public-share button{min-height:44px;border:1px solid #245346;border-radius:4px;background:transparent;color:#245346;padding:.7rem 1rem;font:inherit;cursor:pointer}.public-share button:disabled{opacity:.6;cursor:default}.public-share input{display:block;box-sizing:border-box;width:100%;padding:.7rem;margin-top:.4rem;font:inherit}.public-share p{line-height:1.5}
</style>
