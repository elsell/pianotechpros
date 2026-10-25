<script lang="ts">
 import {onDestroy,tick} from 'svelte';
 import {createInventoryHistoryApiClient,InventoryClientError,type InventoryHistoryEntry} from '@pianotechpros/api-client';
 import {createInventoryHistory,type InventoryHistoryState,type SessionCredential} from '@pianotechpros/client-core';
 import {inventoryHistoryFieldKey,type Translator,type MessageKey} from '@pianotechpros/i18n';
 export let accountId:string;export let dealerID:string;export let recordID:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let open=false;let active=true;let heading:HTMLHeadingElement;let trigger:HTMLButtonElement;
 let model:ReturnType<typeof createInventoryHistory<InventoryHistoryEntry>>|null=null;let unsubscribe=()=>{};
 let state:InventoryHistoryState<InventoryHistoryEntry>={items:[],busy:false,issue:null,operation:'latest',loaded:false};
 const message=(key:string)=>i18n.t(key as MessageKey);
 async function show(){open=true;const current=createInventoryHistory<InventoryHistoryEntry>({list:async(cursor,signal)=>{const session=credential;try{return await createInventoryHistoryApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null).list(dealerID,recordID,cursor,signal);}catch(error){if(active&&credential.token===session.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}},classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='protocol_error'?'protocol_error':'unavailable'});model=current;unsubscribe=current.subscribe(value=>state=value);await tick();if(!active||model!==current||!open)return;heading?.focus();await current.latest();}
 async function close(){unsubscribe();model?.dispose();model=null;open=false;await tick();if(active)trigger?.focus();}
 async function page(operation:'latest'|'older'|'retry'){await model?.[operation]();if(active&&open)heading.focus();}
 onDestroy(()=>{active=false;unsubscribe();model?.dispose();});
</script>
<section class="history">
 <button bind:this={trigger} type="button" aria-expanded={open} onclick={()=>open?close():show()}>{i18n.t(open?'history.close':'history.open')}</button>
 {#if open}<h3 tabindex="-1" bind:this={heading}>{i18n.t('history.title')}</h3><p>{i18n.t('history.savedOnly')}</p>
 {#if state.busy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if state.issue}<p role="alert">{i18n.t(state.issue==='denied'?'inventory.denied':'history.failed')}</p>{#if state.issue!=='denied'}<button disabled={state.busy} onclick={()=>page('retry')}>{i18n.t('inventory.retry')}</button>{/if}{/if}
 {#if state.loaded&&!state.items.length}<p>{i18n.t('history.empty')}</p>{/if}
 <ol>{#each state.items as entry (entry.revision)}<li>
  <h4>{message(`history.kind.${entry.kind}`)}</h4><p class="meta">{i18n.t('history.revision',{number:i18n.number(entry.revision)})}<br/><time datetime={entry.occurred_at}>{i18n.date(new Date(entry.occurred_at),{dateStyle:'medium',timeStyle:'short'})}</time></p>
  <dl><dt>{i18n.t('history.actor')}</dt><dd>{entry.actor_id===accountId?i18n.t('history.you'):i18n.t('history.account',{id:entry.actor_id})}</dd><dt>{i18n.t('history.origin')}</dt><dd>{message(`history.source.${entry.source}`)}</dd>
  {#if entry.from}<dt>{i18n.t('history.from')}</dt><dd>{message(`inventory.status.${entry.from}`)}</dd>{/if}{#if entry.to}<dt>{i18n.t('history.to')}</dt><dd>{message(`inventory.status.${entry.to}`)}</dd>{/if}
  {#if entry.sale_price}<dt>{i18n.t('history.field.sale_price')}</dt><dd>{i18n.money(entry.sale_price.minor_units,entry.sale_price.currency)}</dd>{/if}{#if entry.reason}<dt>{i18n.t('history.reason')}</dt><dd>{entry.reason}</dd>{/if}</dl>
  <ul>{#each entry.fields as field}<li>{entry.kind==='attributes'?i18n.t('history.fieldOrigin',{field:i18n.t(inventoryHistoryFieldKey(field)),origin:message(`history.source.${entry.field_sources?.[field]??'unknown'}`)}):i18n.t(inventoryHistoryFieldKey(field))}</li>{/each}</ul>
 </li>{/each}</ol>
 {#if state.issue!=='denied'}<div class="controls"><button disabled={state.busy} onclick={()=>page('latest')}>{i18n.t('history.latest')}</button>{#if state.nextCursor}<button disabled={state.busy} onclick={()=>page('older')}>{i18n.t('history.older')}</button>{/if}</div>{/if}
 {/if}
</section>
<style>
 .history{margin-top:2rem;border-top:1px solid #cbd6cf;padding-top:1rem;overflow-wrap:anywhere}button{font:inherit;min-height:44px;padding:.65rem .9rem;background:white;border:1px solid #9caf9f;border-radius:.5rem;color:#183e32;cursor:pointer}button:disabled{opacity:.55}ol{list-style:none;padding:0}ol>li{border-bottom:1px solid #d7dfda;padding:1rem 0}h4{margin:0;font-size:1.1rem}.meta,dt{color:#52645e}dd{margin:.2rem 0 .75rem;white-space:pre-wrap}.controls{display:flex;flex-wrap:wrap;gap:.75rem}:is(button,h3):focus-visible{outline:3px solid #246aab;outline-offset:3px}
</style>
