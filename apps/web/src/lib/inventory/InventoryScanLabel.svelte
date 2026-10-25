<script lang="ts">
 import {sessionScopedFailure} from '@pianotechpros/api-client';
 import {mountInventoryLabel,printInventoryLabel} from '../browser-events';
 import {onDestroy,tick} from 'svelte';
 import {createInventoryScanApiClient,InventoryClientError} from '@pianotechpros/api-client';
 import {createInventoryScanLabel,type ScanLabelState,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator} from '@pianotechpros/i18n';
 export let dealerID:string;export let recordID:string;export let stock:string;export let title:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let dialog:HTMLDialogElement;let trigger:HTMLButtonElement;let active=true;let open=false;let savedStock='';let savedTitle='';
 let model:ReturnType<typeof createInventoryScanLabel>|null=null;let unsubscribe=()=>{};
 let state:ScanLabelState={busy:false,issue:null,value:null};
 const viewBox=(size:number)=>[0,0,size,size].join(' ');
 const path=(matrix:boolean[][])=>matrix.flatMap((row,y)=>row.flatMap((dark,x)=>dark?[`M${x} ${y}h1v1h-1z`]:[])).join('');
 async function show(){
  if(open)return;open=true;savedStock=stock;savedTitle=title;
  const current=createInventoryScanLabel({origin:window.location.origin,dealerID,load:async signal=>{const session=credential;try{return await createInventoryScanApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null).ensure(dealerID,recordID,signal);}catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(active&&credential.token===session.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}},classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':'unavailable'});
  model=current;unsubscribe=current.subscribe(value=>state=value);await tick();if(!active||model!==current||!open)return;dialog.showModal();await current.load();
 }
 async function close(){if(!open)return;open=false;unsubscribe();model?.dispose();model=null;state={busy:false,issue:null,value:null};dialog.close();await tick();if(active)trigger?.focus();}
 onDestroy(()=>{active=false;unsubscribe();model?.dispose();});
</script>
<button type="button" bind:this={trigger} onclick={show}>{i18n.t('scan.label.open')}</button>
<dialog bind:this={dialog} use:mountInventoryLabel data-piano-label aria-labelledby="scan-label-title" oncancel={()=>void close()} onclose={()=>void close()}>
 <div class="controls"><button onclick={()=>close()}>{i18n.t('scan.label.close')}</button></div>
 <h2 id="scan-label-title">{i18n.t('scan.label.title')}</h2>
 {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if state.issue}<p role="alert">{i18n.t(state.issue==='denied'?'inventory.denied':'scan.label.failed')}</p>{#if state.issue!=='denied'}<button onclick={()=>model?.load()}>{i18n.t('inventory.retry')}</button>{/if}{/if}
 {#if state.value}<article class="printed-label"><h3>{savedTitle}</h3><p class="stock">{savedStock}</p><svg viewBox={viewBox(state.value.matrix.length)} role="img" aria-label={i18n.t('scan.label.image')} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d={path(state.value.matrix)} fill="black"/></svg><p>{i18n.t('scan.label.signIn')}</p></article>
 <div class="controls"><p>{i18n.t('scan.label.saved')}</p><button onclick={printInventoryLabel}>{i18n.t('scan.label.print')}</button></div>{/if}
</dialog>
<style>
 button{font:inherit;min-height:44px;padding:.65rem .9rem;background:white;border:1px solid #9caf9f;border-radius:.5rem;color:#183e32;cursor:pointer}button:focus-visible{outline:3px solid #246aab;outline-offset:3px}dialog{max-width:min(32rem,calc(100vw - 3rem));max-height:90vh;overflow:auto;padding:1.5rem;border:1px solid #a8b7ae;border-radius:1rem;color:#183e32;background:#fff}dialog::backdrop{background:#10241db3}.controls{display:flex;flex-wrap:wrap;gap:1rem;align-items:center}.printed-label{text-align:center;overflow-wrap:anywhere}.printed-label h3{font-size:1.5rem;margin-bottom:.5rem}.stock{font-size:1.2rem}svg{width:100%;max-width:20rem;aspect-ratio:1;display:block;margin:auto}h2{font-size:1.15rem}
 @media print{dialog:not([open]){display:none!important}:global(body:has(>dialog[data-piano-label][open]) > :not(dialog[data-piano-label][open])){display:none!important}dialog{display:block;position:static;max-width:none;max-height:none;width:90mm;margin:0;padding:5mm;border:0;overflow:visible;color:black}dialog::backdrop{display:none}.controls,h2{display:none}svg{width:70mm;max-width:70mm}.printed-label{break-inside:avoid}}
</style>
