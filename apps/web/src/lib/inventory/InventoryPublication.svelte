<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {createInventoryPublicationApiClient,createInventoryPhotoApiClient,InventoryClientError,InventoryPublicationError,type InventoryPublicationState,type InventoryPhoto,type PublicationReadinessField} from '@pianotechpros/api-client';
 import {createInventoryPublicationWorkspace,inventoryCurrencies,inventoryMoneyFromInput,type PublicationCommand,type InventoryFormWorkspace,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import {protectPendingNavigation} from '../browser-events';
 import PhotoImage from './PhotoImage.svelte';
 export let workspace:InventoryFormWorkspace;export let accountId:string;export let dealerID:string;export let recordID:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;export let onBusy:(value:boolean)=>void=()=>{};export let otherBusy=false;export let publishReady=true;
 type ReviewState=InventoryPublicationState&{photos:InventoryPhoto[]};
 let previewPage=0;let active=true;let dialog:HTMLDialogElement;let reviewHeading:HTMLHeadingElement;let target:Extract<PublicationCommand,{kind:'transition'}>['status']='available';let amount='';let currency:string=inventoryCurrencies[0];let reason='';let invalid=false;let missing:readonly PublicationReadinessField[]=[];
 const statuses=['draft','available','reserved','in_service','sold','archived'] as const;
 const t=(key:string)=>i18n.t(`inventory.publication.${key}` as MessageKey);
 const statusLabel=(value:string)=>i18n.t(`inventory.status.${value}` as MessageKey);
 const money=(value:{minor_units:number;currency:string})=>i18n.money(value.minor_units,value.currency);
 async function request<T>(operation:(api:ReturnType<typeof createInventoryPublicationApiClient>,photos:ReturnType<typeof createInventoryPhotoApiClient>)=>Promise<T>){
  const session=credential;const token=()=>Date.parse(session.expiresAt)>Date.now()?session.token:null;
  try{return await operation(createInventoryPublicationApiClient(apiURL,token),createInventoryPhotoApiClient(apiURL,token));}
  catch(error){if(active&&error instanceof InventoryPublicationError)missing=error.missing;if(active&&session.token===credential.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}
 }
 async function withPhotos(value:InventoryPublicationState):Promise<ReviewState>{const photos=await request((_,api)=>api.list(dealerID,recordID));if(photos.record.revision!==value.record.revision)throw new InventoryClientError('conflict',409);return {...value,photos:photos.photos};}
 const controller=createInventoryPublicationWorkspace<ReviewState>({userID:accountId,dealerID,recordID,active:()=>active&&workspace.recordID()===recordID&&!!workspace.snapshot().draft,copy:value=>JSON.parse(JSON.stringify(value)),
  withMutation:work=>workspace.withMediaMutation(work),get:async()=>withPhotos(await request(api=>api.get(dealerID,recordID))),
  execute:async(command,revision)=>({...await request(api=>command.kind==='publish'?api.publish(dealerID,recordID,revision):command.kind==='unpublish'?api.unpublish(dealerID,recordID,revision):api.transition(dealerID,recordID,revision,command.status,command.salePrice,command.reason)),photos:[]}),
  classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='conflict'?'conflict':error instanceof InventoryClientError&&[400,422].includes(error.status)?'rejected':'uncertain',
 });
 let state=controller.snapshot();
 $: onBusy(state.busy);
 $: disabled=otherBusy||state.busy||state.failure==='denied';
 async function run(work:()=>Promise<unknown>){missing=[];invalid=false;try{await work();}catch{/* Only localized, stable controller state is presented. */}}
 async function review(command:PublicationCommand){previewPage=0;await run(()=>controller.review(command));if(!active||!controller.snapshot().review)return;await tick();if(active){dialog.showModal();reviewHeading.focus({preventScroll:true});dialog.scrollTop=0;}}
 function cancel(){if(state.busy)return;controller.cancel();dialog.close();}
 async function confirm(){await run(()=>controller.confirm());if(active){dialog.close();if(controller.snapshot().outcome==='succeeded'){amount='';reason='';}}}
 async function changeStatus(){
  invalid=false;let salePrice=null;
  try{if(target==='sold'){salePrice=inventoryMoneyFromInput(amount,currency,i18n.locale==='es'?',':'.');if(!salePrice)throw Error('invalid');}if([...reason.trim()].length>1000||((['sold','archived'].includes(state.state?.record.status??'')||target==='draft')&&!reason.trim()))throw Error('invalid');}
  catch{invalid=true;return;}
  await review({kind:'transition',status:target,salePrice,reason:reason.trim()});
 }
 onMount(()=>{const unprotect=protectPendingNavigation(()=>state.busy);const unsubscribe=controller.subscribe(value=>{state=value;if(value.failure==='denied'){amount='';reason='';}});void run(()=>controller.refresh());return()=>{active=false;unsubscribe();unprotect();controller.dispose();onBusy(false);};});
</script>
<section class="publication" aria-labelledby="publication-heading">
 <h3 id="publication-heading">{t('heading')}</h3>
 {#if state.state}<p>{statusLabel(state.state.record.status)} · <span>{t(state.state.publication?.visible?'visible':state.state.publication?'hidden':'absent')}</span></p>{/if}
 {#if state.busy}<p role="status">{t('busy')}</p>{/if}
 {#if state.outcome==='unknown'}<p role="alert">{t('unknown')}</p>{:else if state.failure}<p role="alert">{state.failure==='denied'?i18n.t('inventory.denied'):t(state.failure==='conflict'?'conflict':'failed')}</p>{:else if state.outcome==='succeeded'}<p role="status">{t('success')}</p>{/if}
 {#each missing as field}<p role="alert">{t(`missing.${field}`)}</p>{/each}
 {#if !publishReady}<p class="hint">{t('saveFirst')}</p>{/if}
 <div class="actions"><button disabled={disabled||!publishReady} onclick={()=>review({kind:'publish'})}>{t('publish')}</button><button disabled={disabled||!state.state?.publication?.visible} onclick={()=>review({kind:'unpublish'})}>{t('unpublish')}</button><button disabled={state.busy||otherBusy} onclick={()=>run(()=>controller.refresh())}>{t('refresh')}</button></div>
 <details><summary>{t('target')}</summary><form onsubmit={event=>{event.preventDefault();void changeStatus();}}>
  <label for="publication-status">{t('target')}</label><select id="publication-status" bind:value={target} disabled={disabled}>{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select>
  {#if target==='sold'}<label for="publication-amount">{t('amount')}</label><input id="publication-amount" inputmode="decimal" maxlength="40" bind:value={amount} disabled={disabled} /><label for="publication-currency">{t('currency')}</label><select id="publication-currency" bind:value={currency} disabled={disabled}>{#each inventoryCurrencies as value}<option>{value}</option>{/each}</select>{/if}
  <label for="publication-reason">{t('reason')}</label><textarea id="publication-reason" maxlength="2000" bind:value={reason} disabled={disabled}></textarea><p class="hint">{t('reasonHint')}</p>
  {#if invalid}<p role="alert">{t('invalid')}</p>{/if}<button type="submit" disabled={disabled}>{t('change')}</button>
 </form></details>
 <dialog bind:this={dialog} aria-labelledby="publication-review-heading" oncancel={event=>{event.preventDefault();cancel();}}>
  <h3 id="publication-review-heading" tabindex="-1" bind:this={reviewHeading}>{t('review')}</h3>
  {#if state.review}
   {@const reviewed=state.review.state}{@const command=state.review.command}{@const attributes=reviewed.record.attributes}
   <p>{t(command.kind==='publish'?'publishHint':command.kind==='unpublish'?'unpublishHint':'lifecycleHint')}</p>
   {#if command.kind==='publish'}
    <h4>{attributes.title||[attributes.make,attributes.model].filter(Boolean).join(' ')||attributes.stock_number}</h4>
    <dl>{#each ['stock_number','make','model','size','finish','description'] as field}{@const value=attributes[field as keyof typeof attributes]}{#if value}<dt>{i18n.t(`inventory.field.${field}` as MessageKey)}</dt><dd>{String(value)}</dd>{/if}{/each}
    {#each ['form','condition'] as field}{@const value=attributes[field as 'form'|'condition']}<dt>{i18n.t(`inventory.field.${field}` as MessageKey)}</dt><dd>{value?i18n.t(`inventory.${field}.${value}` as MessageKey):i18n.t('inventory.edit.unknown')}</dd>{/each}
    {#each ['featured','player_system'] as field}<dt>{i18n.t(`inventory.field.${field}` as MessageKey)}</dt><dd>{i18n.t(attributes[field as 'featured'|'player_system']?'inventory.edit.yes':'inventory.edit.no')}</dd>{/each}
    {#if attributes.manufactured}{#each ['year','month','day'] as field}{@const value=attributes.manufactured[field as 'year'|'month'|'day']}{#if value}<dt>{i18n.t(`inventory.field.${field}` as MessageKey)}</dt><dd>{i18n.number(value,{useGrouping:false})}</dd>{/if}{/each}{/if}
    <dt>{i18n.t('inventory.field.asking_amount')}</dt><dd>{attributes.price_visible&&attributes.asking_price?money(attributes.asking_price):t('noPrice')}</dd></dl>
    <ol class="preview" start={previewPage*6+1}>{#each reviewed.photos.slice(previewPage*6,previewPage*6+6) as photo (photo.id)}<li><PhotoImage read={()=>request((_,api)=>api.image(dealerID,recordID,photo.id))} alt={photo.altText||i18n.t('inventory.photos.number',{number:i18n.number(reviewed.photos.indexOf(photo)+1)})} {i18n} /></li>{/each}</ol>{#if reviewed.photos.length>6}<nav aria-label={i18n.t('inventory.photos.heading')}><button disabled={previewPage===0} onclick={()=>previewPage--}>{i18n.t('inventory.photos.previous')}</button><button disabled={(previewPage+1)*6>=reviewed.photos.length} onclick={()=>previewPage++}>{i18n.t('inventory.photos.next')}</button></nav>{/if}{#if !reviewed.photos.length}<p>{t('noPhotos')}</p>{/if}
   {:else if command.kind==='transition'}<p>{statusLabel(reviewed.record.status)} → {statusLabel(command.status)}</p><p>{t('privateSale')}</p>{#if command.salePrice}<p>{t('amount')}: {money(command.salePrice)}</p>{/if}{#if command.reason}<p>{t('reason')}: {command.reason}</p>{/if}{/if}
  {/if}
  <div class="actions"><button disabled={state.busy} onclick={cancel}>{t('cancel')}</button><button disabled={state.busy||!state.review} onclick={confirm}>{t('confirm')}</button></div>
 </dialog>
</section>
<style>
 .publication{margin:1.5rem 0;padding:1rem;border:1px solid #cbd6cf;border-radius:.6rem;overflow-wrap:anywhere}h3{margin-top:0}.actions{display:flex;flex-wrap:wrap;gap:.5rem}button,input,select,textarea{font:inherit;min-height:44px;border:1px solid #9caf9f;border-radius:.5rem;padding:.65rem;background:white;color:#183e32;box-sizing:border-box}button{cursor:pointer}button:disabled{opacity:.55}label{display:block;margin:1rem 0 .4rem}input,select,textarea{width:100%}summary{cursor:pointer;padding:1rem 0;min-height:44px}.hint{color:#52645e;line-height:1.5}dialog{width:min(38rem,calc(100% - 3rem));max-height:85dvh;overflow:auto;border:1px solid #9caf9f;border-radius:.8rem;padding:1.25rem;color:#183e32}dialog::backdrop{background:#10251acc}dt{font-weight:650}dd{margin:.3rem 0 1rem;white-space:pre-wrap}.preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;padding-left:1.4rem}:is(button,input,select,textarea,summary):focus-visible{outline:3px solid #246aab;outline-offset:3px}
</style>
