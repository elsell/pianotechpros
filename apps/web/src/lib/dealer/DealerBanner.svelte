<script lang="ts">
 import {sessionScopedFailure} from '@pianotechpros/api-client';
 import {onMount,tick} from 'svelte';
 import {createDealerBannerApiClient,DealerClientError,type DealerProfile} from '@pianotechpros/api-client';
 import {createDealerBanner,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator} from '@pianotechpros/i18n';
 import {readBrowserBanner} from '../inventory/photo-media';
 import {browserEvents} from '../browser-events';
 import PhotoImage from '../inventory/PhotoImage.svelte';
 export let dealerID:string;
 export let apiURL:string;
 export let credential:SessionCredential;
 export let i18n:Translator;
 export let onSessionRejected:()=>void;
 export let onBack:()=>void;
 let active=false,selectionSequence=0,selecting=false,selectionError=false;
 let preview:string|null=null;
 let dialog:HTMLDialogElement;
 let picker:HTMLInputElement;
 const denied=(error:unknown)=>error instanceof DealerClientError&&[401,403,404].includes(error.status);
 async function request<T>(run:(api:ReturnType<typeof createDealerBannerApiClient>)=>Promise<T>):Promise<T>{
  const session=credential;
  try{return await run(createDealerBannerApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}
  catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(active&&error instanceof DealerClientError&&error.status===401&&session.token===credential.token)onSessionRejected();throw error;}
 }
 const controller=createDealerBanner<DealerProfile>({
  dealerID,initial:null,key:()=>crypto.randomUUID(),
  load:signal=>request(api=>api.get(dealerID,signal)),
  upload:(bytes,key,revision,signal)=>request(api=>api.upload(dealerID,bytes,key,revision,signal)),
  remove:(revision,signal)=>request(api=>api.remove(dealerID,revision,signal)),
  denied,conflict:error=>error instanceof DealerClientError&&['conflict','idempotency_conflict'].includes(error.code),
  rejected:error=>error instanceof DealerClientError&&['invalid_photo','photo_limit_exceeded','validation_failed','bad_request'].includes(error.code),
 });
 let state=controller.snapshot();
 function clearPreview(){if(preview)URL.revokeObjectURL(preview);preview=null;}
 async function choose(event:Event){
  const file=(event.currentTarget as HTMLInputElement).files?.[0];
  picker.value='';if(!file)return;
  const sequence=++selectionSequence;selecting=true;selectionError=false;
  let candidate:string|null=null;
  try{
   const selected=await readBrowserBanner(file);const bytes=selected.bytes;candidate=selected.url;
   if(!active||sequence!==selectionSequence||!controller.select(bytes))return;
   clearPreview();preview=candidate;candidate=null;await tick();
  }catch{if(active&&sequence===selectionSequence)selectionError=true;}
  finally{if(candidate)URL.revokeObjectURL(candidate);if(active&&sequence===selectionSequence)selecting=false;}
 }
 async function readImage(id:string){
  try{return await request(api=>api.image(dealerID,id));}
  catch(error){if(active&&denied(error))void controller.refresh();throw error;}
 }
 $: reviewing=['upload-review','upload-uncertain','remove-review'].includes(state.phase);
 $: if(active&&dialog){if(reviewing&&!dialog.open)dialog.showModal();else if(!reviewing&&dialog.open)dialog.close();}
 onMount(()=>{
  active=true;
  const unsubscribe=controller.subscribe(value=>{state=value;if(!value.hasSelection)clearPreview();});
  void controller.refresh();
  const events=browserEvents('dealer-banner');
  const interrupt=()=>{if(!events.visible()){selectionSequence++;selecting=false;controller.interrupt();}};
  events.addVisibility(interrupt);
  return()=>{active=false;selectionSequence++;events.removeVisibility(interrupt);unsubscribe();controller.dispose();clearPreview();};
 });
</script>
<header><button disabled={state.busy||selecting} onclick={onBack}>{i18n.t('dealer.banner.back')}</button><h2 id="banner-heading">{i18n.t('dealer.banner.heading')}</h2><p>{i18n.t('dealer.banner.intro')}</p></header>
<div class="banner-settings" aria-busy={state.busy||selecting}>
 {#if state.current}
  <div class="current">
   {#if state.current.banner}{#key state.current.banner.id}<PhotoImage read={()=>readImage(state.current!.banner!.id)} alt={state.current.profile.banner_alt_text||i18n.t('dealer.banner.current')} {i18n} />{/key}
   {:else}<p>{i18n.t('dealer.banner.empty')}</p>{/if}
  </div>
  <p class="hint">{i18n.t('dealer.banner.formats')}</p><p class="hint">{i18n.t('dealer.banner.altHint')}</p>
  <input class="file-input" tabindex="-1" bind:this={picker} type="file" accept="image/jpeg,image/png,image/webp" aria-label={i18n.t('dealer.banner.choose')} onchange={choose} disabled={state.busy||selecting||state.phase!=='idle'} />
  <div class="actions"><button disabled={state.busy||selecting||state.phase!=='idle'} onclick={()=>picker.click()}>{i18n.t('dealer.banner.choose')}</button>
   {#if state.current.banner}<button class="secondary" disabled={state.busy||selecting||state.phase!=='idle'} onclick={()=>controller.reviewRemoval()}>{i18n.t('dealer.banner.remove')}</button>{/if}
  </div>
 {/if}
 {#if state.busy||selecting}<p role="status">{i18n.t(state.busy&&state.phase!=='idle'?'dealer.banner.busy':'common.loading')}</p>{/if}
 {#if selectionError}<p role="alert">{i18n.t('dealer.banner.invalid')}</p>{/if}
 {#if state.denied}<p role="alert">{i18n.t('dealer.banner.denied')}</p>
 {:else if state.phase==='refresh-required'}<p role="alert">{i18n.t('dealer.banner.refreshRequired')}</p>
 {:else if state.failure&&!reviewing}<p role="alert">{i18n.t('dealer.banner.failed')}</p>{/if}
 {#if state.notice}<p role="status">{i18n.t(state.notice==='uploaded'?'dealer.banner.uploaded':state.notice==='removed'?'dealer.banner.removed':'dealer.banner.superseded')}</p>{/if}
 {#if !reviewing}<button class="secondary" disabled={state.busy||selecting} onclick={()=>controller.refresh()}>{i18n.t('dealer.banner.refresh')}</button>{/if}
</div>
<dialog bind:this={dialog} aria-labelledby="banner-review-heading" oncancel={event=>{event.preventDefault();if(!state.busy)controller.cancel();}}>
 <h3 id="banner-review-heading">{i18n.t(state.phase==='remove-review'?'dealer.banner.removeReview':'dealer.banner.review')}</h3>
 {#if state.phase==='remove-review'}<p>{i18n.t('dealer.banner.removeHint')}</p>
 {:else if preview}<img class="preview" src={preview} alt={i18n.t('dealer.banner.preview')} />{/if}
 <p>{i18n.t('dealer.banner.immediate')}</p>
 {#if state.phase==='upload-uncertain'}<p role="alert">{i18n.t('dealer.banner.uncertain')}</p>
 {:else if state.failure}<p role="alert">{i18n.t('dealer.banner.failed')}</p>{/if}
 {#if state.busy}<p role="status">{i18n.t('dealer.banner.busy')}</p>{/if}
 <div class="actions"><button class="secondary" disabled={state.busy} onclick={()=>controller.cancel()}>{i18n.t('dealer.banner.cancel')}</button>
  <button disabled={state.busy} onclick={()=>state.phase==='remove-review'?controller.confirmRemoval():controller.confirmUpload()}>{i18n.t(state.phase==='remove-review'?'dealer.banner.confirmRemove':state.phase==='upload-uncertain'?'dealer.banner.retry':'dealer.banner.confirm')}</button>
 </div>
</dialog>
<style>
 header{max-width:46rem}h2{margin:1.4rem 0 .6rem}header p,.hint{color:#52645e;line-height:1.6}.banner-settings{max-width:46rem}.current{display:grid;place-items:center;min-height:12rem;background:#edf1ed;border:1px solid #d8e0d9;border-radius:.8rem;overflow:hidden;padding:1rem}.current p{max-width:28rem;line-height:1.6}.file-input{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.actions{display:flex;gap:.75rem;flex-wrap:wrap;margin:1.4rem 0}button{font:inherit;min-height:44px;padding:.75rem 1rem;border:1px solid #245b43;border-radius:.6rem;background:#245b43;color:white;cursor:pointer}button.secondary{background:white;color:#245b43}button:disabled{opacity:.55;cursor:wait}button:focus-visible{outline:3px solid #246aab;outline-offset:3px}dialog{width:min(44rem,calc(100vw - 3rem));box-sizing:border-box;max-height:90dvh;overflow:auto;border:1px solid #cbd6ce;border-radius:1rem;padding:1.5rem;color:#182c28}dialog::backdrop{background:#10251f99}dialog p{line-height:1.6}.preview{display:block;width:100%;max-height:55dvh;object-fit:contain;background:#edf1ed}h3{font-size:1.4rem;margin-top:0}
</style>
