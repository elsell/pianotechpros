<script lang="ts">
 import {sessionScopedFailure} from '@pianotechpros/api-client';
 import InventoryEditor from './InventoryEditor.svelte';
 import { onMount } from 'svelte';
 import { createInventoryApiClient, InventoryClientError } from '@pianotechpros/api-client';
 import { createInventoryBrowser, inventoryBrowseStatuses, type InventoryBrowseStatus, type SessionCredential } from '@pianotechpros/client-core';
 import type { Translator, MessageKey } from '@pianotechpros/i18n';
 export let accountId:string;export let dealerID:string; export let credential:SessionCredential; export let apiURL:string; export let i18n:Translator;
 export let onBack:()=>void; export let onSessionRejected:()=>void;
 type Row={id:string;title:string;stock:string;status:string;featured:boolean};
 let selected:string|null=null;
 let heading:HTMLHeadingElement;
 let active=true;let search='';let status:InventoryBrowseStatus='active';
 const statusKey=(value:string)=>`inventory.status.${value}` as MessageKey;
 const browser=createInventoryBrowser<Row>({copy:row=>({...row}),accessDenied:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status),list:async(filters,cursor)=>{
  const session=credential;
  try{
   const page=await createInventoryApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null).list(dealerID,{search:filters.search,status:filters.status==='all'||filters.status==='active'?undefined:filters.status,includeInactive:filters.status==='all',cursor});
   return {...page,items:page.items.map(r=>({id:r.id,title:r.attributes.title||[r.attributes.make,r.attributes.model].filter(Boolean).join(' ')||r.attributes.stock_number,stock:r.attributes.stock_number,status:r.status,featured:!!r.attributes.featured}))};
  }catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(error instanceof InventoryClientError&&error.status===401&&active&&session.token===credential.token)onSessionRejected();throw error;}
 }});
 let state=browser.snapshot();
 onMount(()=>{heading.focus();const unsubscribe=browser.subscribe(next=>{state=next;});void browser.refresh();return()=>{active=false;unsubscribe();browser.dispose();};});
 function apply(){void browser.filter({search,status});}
</script>
{#if selected}{#key selected}<InventoryEditor {accountId} {dealerID} recordID={selected} {credential} {apiURL} {i18n} {onSessionRejected} onBack={()=>{selected=null;void browser.filter(state.filters);}} />{/key}
{:else}
<section aria-labelledby="inventory-heading">
 <button onclick={onBack}>{i18n.t('inventory.back')}</button>
 <header><h2 id="inventory-heading" tabindex="-1" bind:this={heading}>{i18n.t('inventory.heading')}</h2><div class="actions"><button onclick={()=>{selected='new';}}>{i18n.t('inventory.edit.new')}</button><button disabled={state.busy} onclick={()=>browser.refresh()}>{i18n.t('inventory.refresh')}</button></div></header>
 <form onsubmit={(event)=>{event.preventDefault();apply();}}>
  <label for="inventory-search">{i18n.t('inventory.search')}</label>
  <div class="search"><input id="inventory-search" type="search" maxlength="120" bind:value={search} /><button type="submit">{i18n.t('inventory.submitSearch')}</button></div>
  <label for="inventory-status">{i18n.t('inventory.statusLabel')}</label><select id="inventory-status" bind:value={status} onchange={apply}>{#each inventoryBrowseStatuses as value}<option value={value}>{i18n.t(statusKey(value))}</option>{/each}</select>
 </form>
 {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if state.failed}<p role="alert">{i18n.t(state.denied?'inventory.denied':'inventory.loadFailed')}</p><button onclick={()=>browser.retry()}>{i18n.t('inventory.retry')}</button>{/if}
 <ul aria-busy={state.busy}>{#each state.items as item(item.id)}<li><div class="row-heading"><h4><button class="item" onclick={()=>{selected=item.id;}}>{item.title}</button></h4>{#if item.featured}<span class="featured">{i18n.t('inventory.featured')}</span>{/if}</div><p>{i18n.t('inventory.stock',{number:item.stock})}</p><p class="status">{i18n.t(statusKey(item.status))}</p></li>{/each}</ul>
 {#if !state.busy&&!state.failed&&!state.items.length}<p>{i18n.t(state.filters.search||state.filters.status!=='active'?'inventory.noMatches':'inventory.empty')}</p>{/if}
 {#if state.nextCursor}<button disabled={state.busy} onclick={()=>browser.more()}>{i18n.t('inventory.more')}</button>{/if}
</section>
{/if}
<style>
 .item{font:inherit;font-weight:650;text-align:left}header,.row-heading,.search,.actions{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}h2{font-size:1.65rem}h4{font-size:1.15rem;margin:0}form{display:grid;gap:.65rem;margin:1.5rem 0}label{font-weight:600}input,select,button{font:inherit;min-height:44px;border:1px solid #aabbb1;border-radius:.5rem;padding:.6rem .8rem;color:#183e32;background:white}input{flex:1;min-width:0;width:100%}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}:is(button,input,select):focus-visible{outline:3px solid #246aab;outline-offset:3px}ul{list-style:none;padding:0}li{padding:1rem 0;border-bottom:1px solid #d8e1da}li p{margin:.4rem 0;color:#52645e}.featured{font-size:.85rem;border:1px solid #aabbb1;border-radius:1rem;padding:.25rem .6rem}.status{font-weight:600}section{overflow-wrap:anywhere}@media(max-width:480px){.search{align-items:stretch;flex-direction:column}}
</style>
