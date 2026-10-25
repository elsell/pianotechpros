<script lang="ts">
 import {onMount} from 'svelte';
 import {createInventoryScanApiClient,createInventoryPhotoApiClient,InventoryClientError,type InventoryRecord,type InventoryPhoto} from '@pianotechpros/api-client';
 import {createInventoryScanView,inventoryScanLabelTitle,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import InventoryEditor from './InventoryEditor.svelte';
 import PhotoImage from './PhotoImage.svelte';
 export let link:string;export let accountId:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let active=true;let editing=false;const imageRequest=new AbortController();
 async function request<T>(work:(scans:ReturnType<typeof createInventoryScanApiClient>,photos:ReturnType<typeof createInventoryPhotoApiClient>)=>Promise<T>){const current=credential;const token=()=>Date.parse(current.expiresAt)>Date.now()?current.token:null;try{return await work(createInventoryScanApiClient(apiURL,token),createInventoryPhotoApiClient(apiURL,token));}catch(error){if(active&&credential.token===current.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}}
 const model=createInventoryScanView<InventoryRecord&{cover:InventoryPhoto|null}>({origin:window.location.origin,resolve:(dealer,token,signal)=>request(api=>api.resolve(dealer,token,signal)),read:(dealer,id,signal)=>request(async(_,api)=>{const value=await api.list(dealer,id,signal);return {...value.record,cover:value.photos[0]??null};}),classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':'unavailable'});
 let state=model.snapshot();
 onMount(()=>{const unsubscribe=model.subscribe(next=>state=next);void model.open(link);return()=>{active=false;imageRequest.abort();unsubscribe();model.dispose();};});
 function back(){editing=false;void model.retry();}
</script>
{#if editing&&state.record}<InventoryEditor {accountId} dealerID={state.record.dealer_id} recordID={state.record.id} {credential} {apiURL} {i18n} onBack={back} {onSessionRejected}/>
{:else}<section aria-labelledby="scan-heading"><h2 id="scan-heading">{i18n.t('scan.view.title')}</h2>
 {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if state.issue}<p role="alert">{i18n.t(state.issue==='invalid'?'scan.view.invalid':state.issue==='denied'?'inventory.denied':'scan.view.failed')}</p>{#if state.issue==='unavailable'}<button onclick={()=>model.retry()}>{i18n.t('inventory.retry')}</button>{/if}{/if}
 {#if state.record}{@const record=state.record}<h3>{inventoryScanLabelTitle(record.attributes)}</h3><p>{record.attributes.stock_number}</p><p>{i18n.t(`inventory.status.${record.status}` as MessageKey)}</p>
 {#if record.cover}{#key record.cover.id}<PhotoImage read={()=>request((_,api)=>api.image(record.dealer_id,record.id,record.cover!.id,imageRequest.signal))} alt={record.cover.altText} {i18n}/>{/key}{:else}<p>{i18n.t('inventory.photos.empty')}</p>{/if}
 <dl><dt>{i18n.t('inventory.field.make')}</dt><dd>{record.attributes.make}</dd><dt>{i18n.t('inventory.field.model')}</dt><dd>{record.attributes.model}</dd></dl>
 <button onclick={()=>editing=true}>{i18n.t('scan.view.editor')}</button><button onclick={()=>model.retry()}>{i18n.t('scan.view.refresh')}</button>{/if}
 </section>{/if}
<style>section{max-width:38rem;margin:1.5rem auto}button{font:inherit;min-height:44px;padding:.65rem 1rem;margin:.5rem;background:#183e32;color:white;border:0;border-radius:.5rem}dt{font-weight:600}dd{margin:0 0 1rem}h3{font-size:1.6rem}</style>
