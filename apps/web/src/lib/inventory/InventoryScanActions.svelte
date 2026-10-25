<script lang="ts">
 import {sessionScopedFailure} from '@pianotechpros/api-client';
 import {onMount,tick} from 'svelte';
 import {createInventoryPublicationApiClient,InventoryClientError,type InventoryPublicationState,type InventoryRecord} from '@pianotechpros/api-client';
 import {publicationSaleDefaults,createInventoryPublicationWorkspace,inventoryCurrencies,inventoryMoneyFromInput,inventoryScanLabelTitle,type PublicationCommand,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import {protectPendingNavigation} from '../browser-events';
 export let accountId:string;export let dealerID:string;export let recordID:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;export let onChanged:()=>void;export let onObserved:(record:InventoryRecord)=>void;export let onIntent:()=>void;export let onDenied:()=>void;export let onBusy:(value:boolean)=>void;
 let active=true;const lifetime=new AbortController();let dialog:HTMLDialogElement;let heading:HTMLHeadingElement;let trigger:HTMLButtonElement|null=null;
 let target:Extract<PublicationCommand,{kind:'transition'}>['status']='available';let amount='';let saleSeeded=false;let currency:string=inventoryCurrencies[0];let reason='';let invalid=false;
 const statuses=['draft','available','reserved','in_service','sold','archived'] as const;
 const t=(key:string)=>i18n.t(`inventory.publication.${key}` as MessageKey);
 const statusLabel=(value:string)=>i18n.t(`inventory.status.${value}` as MessageKey);
 async function request<T>(work:(api:ReturnType<typeof createInventoryPublicationApiClient>)=>Promise<T>){const session=credential;try{return await work(createInventoryPublicationApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(active&&session.token===credential.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}}
 const model=createInventoryPublicationWorkspace<InventoryPublicationState>({userID:accountId,dealerID,recordID,active:()=>active,copy:value=>JSON.parse(JSON.stringify(value)),withMutation:work=>work(),get:()=>request(api=>api.get(dealerID,recordID,lifetime.signal)),execute:(command,revision)=>request(api=>{if(command.kind==='publish')throw Error('scan_publication_creation_forbidden');return command.kind==='unpublish'?api.unpublish(dealerID,recordID,revision,lifetime.signal):api.transition(dealerID,recordID,revision,command.status,command.salePrice,command.reason,lifetime.signal);}),classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='conflict'?'conflict':error instanceof InventoryClientError&&[400,422].includes(error.status)?'rejected':'uncertain'});
 let state=model.snapshot();
 $: disabled=state.busy||state.failure==='denied';
 $: onBusy(state.busy);
 async function run(work:()=>Promise<unknown>){try{await work();}catch{/* Controller exposes stable localized failure state. */}}
 async function review(command:PublicationCommand,button?:HTMLButtonElement){onIntent();invalid=false;trigger=button??trigger;await run(()=>model.review(command));if(!active||!model.snapshot().review)return;await tick();if(active){dialog.showModal();heading.focus();}}
 function cancel(){if(state.busy)return;model.cancel();dialog.close();trigger?.focus();}
 async function confirm(){await run(()=>model.confirm());if(!active)return;dialog.close();if(model.snapshot().outcome==='succeeded'){amount='';reason='';saleSeeded=false;onChanged();}else trigger?.focus();}
 function chooseStatus(value:typeof target){target=value;if(value==='sold'&&!saleSeeded){saleSeeded=true;const defaults=publicationSaleDefaults(state.state?.record.attributes.asking_price,i18n.locale==='es'?',':'.');amount=defaults.amount;currency=defaults.currency;}}
 async function changeStatus(button?:HTMLButtonElement){let salePrice=null;invalid=false;try{if(target==='sold'){salePrice=inventoryMoneyFromInput(amount,currency,i18n.locale==='es'?',':'.');if(!salePrice)throw Error('invalid');}if([...reason.trim()].length>1000||((['sold','archived'].includes(state.state?.record.status??'')||target==='draft')&&!reason.trim()))throw Error('invalid');}catch{invalid=true;return;}await review({kind:'transition',status:target,salePrice,reason:reason.trim()},button);}
 onMount(()=>{const unprotect=protectPendingNavigation(()=>state.busy);const unsubscribe=model.subscribe(value=>{state=value;if(value.state)onObserved(value.state.record);if(value.failure==='denied'){amount='';reason='';saleSeeded=false;onDenied();}});void run(()=>model.refresh());return()=>{active=false;lifetime.abort();unsubscribe();unprotect();model.dispose();onBusy(false);};});
</script>
<section class="scan-actions" aria-labelledby="scan-actions-heading">
 <h3 id="scan-actions-heading">{t('heading')}</h3>
 {#if state.state}<p>{statusLabel(state.state.record.status)} · {t(state.state.publication?.visible?'visible':state.state.publication?'hidden':'absent')}</p>{/if}
 {#if state.busy}<p role="status">{t('busy')}</p>{/if}
 {#if state.outcome==='unknown'}<p role="alert">{t('unknown')}</p>{:else if state.failure}<p role="alert">{state.failure==='denied'?i18n.t('inventory.denied'):t(state.failure==='conflict'?'conflict':'failed')}</p>{/if}
 <button disabled={disabled||!state.state?.publication?.visible} onclick={event=>review({kind:'unpublish'},event.currentTarget)}>{t('unpublish')}</button>
 <form onsubmit={event=>{event.preventDefault();void changeStatus(event.submitter instanceof HTMLButtonElement?event.submitter:undefined);}}>
  <label for="scan-status">{t('target')}</label><select id="scan-status" bind:value={target} onchange={event=>chooseStatus(event.currentTarget.value as typeof target)} disabled={disabled}>{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select>
  {#if target==='sold'}<label for="scan-amount">{t('amount')}</label><input id="scan-amount" inputmode="decimal" maxlength="40" bind:value={amount} oninput={()=>saleSeeded=true} disabled={disabled}/><label for="scan-currency">{t('currency')}</label><select id="scan-currency" bind:value={currency} onchange={()=>saleSeeded=true} disabled={disabled}>{#each inventoryCurrencies as value}<option>{value}</option>{/each}</select>{/if}
  <label for="scan-reason">{t('reason')}</label><textarea id="scan-reason" maxlength="2000" bind:value={reason} disabled={disabled}></textarea><p>{t('reasonHint')}</p>
  {#if invalid}<p role="alert">{t('invalid')}</p>{/if}<button type="submit" disabled={disabled}>{t('change')}</button>
 </form>
 {#if state.failure||state.outcome==='unknown'}<button disabled={state.busy} onclick={()=>{onIntent();void run(()=>model.refresh());}}>{t('refresh')}</button>{/if}
 <dialog bind:this={dialog} aria-labelledby="scan-review-heading" oncancel={event=>{event.preventDefault();cancel();}}>
  <h3 id="scan-review-heading" tabindex="-1" bind:this={heading}>{t('review')}</h3>
  {#if state.review}{@const reviewed=state.review.state}{@const command=state.review.command}
   <h4>{inventoryScanLabelTitle(reviewed.record.attributes)}</h4><p>{reviewed.record.attributes.stock_number}</p>
   <p>{t(command.kind==='unpublish'?'unpublishHint':'lifecycleHint')}</p>
   {#if command.kind==='transition'}<p>{statusLabel(reviewed.record.status)} → {statusLabel(command.status)}</p><p>{t('privateSale')}</p>{#if command.salePrice}<p>{t('amount')}: {i18n.money(command.salePrice.minor_units,command.salePrice.currency)}</p>{/if}{#if command.reason}<p>{t('reason')}: {command.reason}</p>{/if}{/if}
  {/if}
  <button disabled={state.busy} onclick={cancel}>{t('cancel')}</button><button disabled={state.busy||!state.review} onclick={confirm}>{t('confirm')}</button>
 </dialog>
</section>
<style>
 .scan-actions{margin:1.5rem 0;border-top:1px solid #cbd6cf;padding-top:1.5rem}button,input,select,textarea{font:inherit;min-height:44px;padding:.65rem;border:1px solid #9caf9f;border-radius:.5rem;background:white;color:#183e32;box-sizing:border-box}button{cursor:pointer;margin:.5rem .5rem .5rem 0}button:disabled{opacity:.55}input,select,textarea{width:100%}label{display:block;margin:1rem 0 .4rem}dialog{width:min(32rem,calc(100% - 3rem));max-height:85dvh;overflow:auto;padding:1.25rem;border:1px solid #9caf9f;border-radius:.8rem;color:#183e32}dialog::backdrop{background:#10251acc}:is(button,input,select,textarea):focus-visible{outline:3px solid #246aab;outline-offset:3px}
</style>
