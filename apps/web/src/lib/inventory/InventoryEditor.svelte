<script lang="ts">
 import {inventoryScanLabelTitle} from '@pianotechpros/client-core';
import {onMount,tick} from 'svelte';
 import InventoryHistory from './InventoryHistory.svelte';
 import InventoryScanLabel from './InventoryScanLabel.svelte';
 import InventoryVoice from './InventoryVoice.svelte';
 import InventoryPublication from './InventoryPublication.svelte';
 import InventoryPhotos from './InventoryPhotos.svelte';
 import {createInventoryApiClient, InventoryClientError} from '@pianotechpros/api-client';
 import {openInventoryCapture, openInventoryFormWorkspace, handoffCapturePhoto, discardCapturePhoto, inventoryTextFields, inventoryForms, inventoryConditions, inventoryCurrencies, inventoryFormErrors, type InventoryForm, type InventoryFormField, type InventoryFormWorkspace, type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import {claimBrowserInventoryCapture,claimBrowserInventoryPhotos,protectPendingNavigation} from '../browser-events';
 import {browserPhotoDigest} from './photo-media';
 import {openBrowserInventoryRecovery} from './recovery-storage';
 export let accountId:string;export let dealerID:string;export let recordID:string;export let credential:SessionCredential;export let apiURL:string;export let i18n:Translator;export let onBack:()=>void;export let onSessionRejected:()=>void;
 let voicePaused=false;let voiceBusy=false;let publicationBusy=false;let photosBusy=false;let internal=false;let formElement:HTMLFormElement;
 let active=true;let loading=true;let failed=false;let captureBusy=false;let denied=false;let heading:HTMLHeadingElement;let workspace:InventoryFormWorkspace|null=null;let unsubscribe=()=>{};
 let state:ReturnType<InventoryFormWorkspace['snapshot']>|null=null;
 async function focusError(field:InventoryFormField){internal=true;await tick();const element=formElement.elements.namedItem(field);if(element&&'focus' in element)(element as HTMLElement).focus();}
 const fieldLink=(key:InventoryFormField)=>`#${key}`;
 const label=(key:InventoryFormField)=>i18n.t(`inventory.field.${key}` as MessageKey);
 const historyScope=(id:string)=>JSON.stringify([accountId,dealerID,id]);
 const fields=['make','model','title','size','finish'] as const;
 const privateFields=['stock_number','serial','location'] as const;
 const comparison=[...Object.keys(inventoryTextFields),'form','condition','year','month','day','asking_amount','asking_currency','cost_amount','cost_currency','featured','player_system','price_visible'] as InventoryFormField[];
 $: errors=state?.draft?inventoryFormErrors(state.draft).filter(field=>state?.baseline||field!=='stock_number'):[];
 async function request<T>(operation:(api:ReturnType<typeof createInventoryApiClient>)=>Promise<T>){const session=credential;try{return await operation(createInventoryApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}catch(error){if(active&&session.token===credential.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}}
 async function load(){
  loading=true;failed=false;denied=false;captureBusy=false;
  try{
   const base={decimal:i18n.locale==='es'?',' as const:'.' as const,active:()=>active,now:Date.now,storage:()=>openBrowserInventoryRecovery(accountId),classify:(error:unknown)=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied' as const:error instanceof InventoryClientError&&error.code==='conflict'?'conflict' as const:error instanceof InventoryClientError&&[400,422].includes(error.status)?'rejected' as const:'uncertain' as const,schedule:(run:()=>void)=>{const timer=setTimeout(run,800);return()=>clearTimeout(timer);}};
   const result=recordID==='new'?await openInventoryCapture({...base,media:{sha256:browserPhotoDigest,handoff:(id,selection)=>handoffCapturePhoto({userID:accountId,dealerID,recordID:id,selection,active:()=>active,authorize:async()=>{await request(api=>api.get(dealerID,id));},lease:()=>claimBrowserInventoryPhotos(accountId,dealerID,id),storage:base.storage,sha256:browserPhotoDigest,now:Date.now}),discard:(id,selection)=>discardCapturePhoto({userID:accountId,dealerID,recordID:id,selection,active:()=>active,authorize:async()=>{await request(api=>api.get(dealerID,id));},lease:()=>claimBrowserInventoryPhotos(accountId,dealerID,id),storage:base.storage,sha256:browserPhotoDigest,now:Date.now})},userID:accountId,dealerID,key:()=>crypto.randomUUID(),authorize:async()=>{await request(api=>api.list(dealerID,{limit:1}));},lease:()=>claimBrowserInventoryCapture(accountId,dealerID),create:key=>request(api=>api.createDraft(dealerID,key)),get:id=>request(api=>api.get(dealerID,id)),edit:(id,attributes,revision,fields)=>request(api=>api.edit(dealerID,id,attributes,revision,fields)),onCreated:()=>{}})
    :await openInventoryFormWorkspace({...base,scope:{userID:accountId,dealerID,recordID},get:()=>request(api=>api.get(dealerID,recordID)),edit:(attributes,revision,fields)=>request(api=>api.edit(dealerID,recordID,attributes,revision,fields))});
   if(!active){result?.dispose();return;}workspace=result;if(result)unsubscribe=result.subscribe(next=>{state=next;});
  }catch(error){if(active){failed=true;captureBusy=error instanceof Error&&error.message==='inventory_capture_busy';denied=error instanceof InventoryClientError&&[401,403,404].includes(error.status);}}
  finally{if(active)loading=false;}
 }
 function change(key:InventoryFormField,value:string|boolean){if(state?.draft)workspace?.change({...state.draft,[key]:value});}
 function display(form:InventoryForm,key:InventoryFormField){const value=form[key];if(typeof value==='boolean')return i18n.t(value?'inventory.edit.yes':'inventory.edit.no');if(!value)return i18n.t('inventory.edit.unknown');if(key==='form'||key==='condition')return i18n.t(`inventory.${key}.${value}` as MessageKey);return value;}
 async function back(){if(photosBusy||publicationBusy||voiceBusy)return;if(!workspace||await workspace.flush()||state?.denied)onBack();}
 onMount(()=>{heading.focus();const unprotect=protectPendingNavigation(()=>!!state&&!state.denied&&state.recovery!=='ready');void load();return()=>{active=false;unprotect();unsubscribe();workspace?.dispose();};});
</script>
<section aria-labelledby="inventory-heading">
 <button type="button" disabled={photosBusy||publicationBusy||voiceBusy} onclick={back}>{i18n.t('inventory.edit.backList')}</button>
 <h2 id="inventory-heading" tabindex="-1" bind:this={heading}>{i18n.t(recordID==='new'&&!state?.baseline?'inventory.edit.new':'inventory.edit.editor')}</h2>
 {#if loading}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if failed}<p role="alert">{i18n.t(denied?'inventory.denied':captureBusy?'inventory.edit.captureBusy':'inventory.edit.loadFailed')}</p><button disabled={loading} onclick={load}>{i18n.t('inventory.retry')}</button>{/if}
 {#if state?.denied}<p role="alert">{i18n.t('inventory.denied')}</p>{/if}
 {#if state?.draft}
  {@const draft=state.draft}
  <p class="hint">{i18n.t('inventory.edit.privateDraft')}</p>
  <div class="save-state" role="status">{i18n.t(voicePaused&&state.recovery==='ready'?'voice.paused':state.recovery==='failed'?'inventory.edit.storageFailed':state.recovery==='writing'?'inventory.edit.localSaving':state.busy?'inventory.edit.saving':state.restored?'inventory.edit.restored':state.conflict?'inventory.edit.conflict':state.uncertain?'inventory.edit.uncertain':state.failure?'inventory.edit.saveFailed':state.invalid?'inventory.edit.invalid':state.dirty?'inventory.edit.unsaved':!state.baseline?'inventory.edit.newReady':'inventory.edit.saved')}</div>
  {#if workspace}<InventoryPhotos otherBusy={voiceBusy||publicationBusy} onBusy={value=>photosBusy=value} {workspace} {accountId} {dealerID} {apiURL} {credential} {i18n} {onSessionRejected} />{/if}
  {#if workspace}<InventoryVoice {workspace} {accountId} {dealerID} {apiURL} {credential} {i18n} {onSessionRejected} otherBusy={photosBusy||publicationBusy} onBusy={value=>voiceBusy=value} onPaused={value=>voicePaused=value} />{/if}
  <form bind:this={formElement} onsubmit={(event)=>{event.preventDefault();void workspace?.save();}}>
   <fieldset><legend>{i18n.t('inventory.edit.identity')}</legend>
    {#each fields as key}<label for={key}>{label(key)}</label><input id={key} value={draft[key]} maxlength={inventoryTextFields[key]*2} aria-invalid={errors.includes(key)} oninput={event=>change(key,event.currentTarget.value)} />{/each}
    {#each ['form','condition'] as key}{@const field=key as 'form'|'condition'}<label for={key}>{label(field)}</label><select id={key} value={draft[field]} onchange={event=>change(field,event.currentTarget.value)}>{#each key==='form'?inventoryForms:inventoryConditions as value}<option value={value}>{i18n.t(value?`inventory.${key}.${value}` as MessageKey:'inventory.edit.unknown')}</option>{/each}</select>{/each}
    <label class="toggle"><input type="checkbox" checked={draft.player_system} onchange={event=>change('player_system',event.currentTarget.checked)} />{label('player_system')}</label>
   </fieldset>
   <fieldset><legend>{i18n.t('inventory.edit.date')}</legend><p class="hint">{i18n.t('inventory.edit.dateHint')}</p><div class="date-fields">{#each ['year','month','day'] as key}{@const field=key as 'year'|'month'|'day'}<div><label for={key}>{label(field)}</label><input id={key} inputmode="numeric" value={draft[field]} maxlength={key==='year'?4:2} aria-invalid={errors.includes(field)} oninput={event=>change(field,event.currentTarget.value)} /></div>{/each}</div></fieldset>
   <fieldset><legend>{i18n.t('inventory.edit.offering')}</legend>
    <label for="description">{label('description')}</label><textarea id="description" rows="5" value={draft.description} oninput={event=>change('description',event.currentTarget.value)} maxlength="20000"></textarea>
    <p class="hint">{i18n.t('inventory.edit.moneyHint',{separator:draft.decimal})}</p>
    <label for="asking_amount">{label('asking_amount')}</label><input id="asking_amount" inputmode="decimal" value={draft.asking_amount} maxlength="40" aria-invalid={errors.includes('asking_amount')} oninput={event=>change('asking_amount',event.currentTarget.value)} />
    <label for="asking_currency">{label('asking_currency')}</label><select id="asking_currency" value={draft.asking_currency} onchange={event=>change('asking_currency',event.currentTarget.value)}>{#each inventoryCurrencies as value}<option>{value}</option>{/each}</select>
    {#each ['price_visible','featured'] as key}{@const field=key as 'price_visible'|'featured'}<label class="toggle"><input type="checkbox" checked={draft[field]} onchange={event=>change(field,event.currentTarget.checked)} />{label(field)}</label>{/each}
   </fieldset>
   <details bind:open={internal}><summary>{i18n.t('inventory.edit.internal')}</summary><fieldset>
    {#each privateFields as key}<label for={key}>{label(key)}</label><input id={key} value={draft[key]} maxlength={inventoryTextFields[key]*2} aria-invalid={errors.includes(key)} oninput={event=>change(key,event.currentTarget.value)} />{/each}
    <label for="cost_amount">{label('cost_amount')}</label><input id="cost_amount" inputmode="decimal" value={draft.cost_amount} maxlength="40" aria-invalid={errors.includes('cost_amount')} oninput={event=>change('cost_amount',event.currentTarget.value)} />
    <label for="cost_currency">{label('cost_currency')}</label><select id="cost_currency" value={draft.cost_currency} onchange={event=>change('cost_currency',event.currentTarget.value)}>{#each inventoryCurrencies as value}<option>{value}</option>{/each}</select>
    <label for="private_notes">{label('private_notes')}</label><textarea id="private_notes" rows="4" value={draft.private_notes} oninput={event=>change('private_notes',event.currentTarget.value)} maxlength="20000"></textarea>
   </fieldset></details>
   {#if errors.length}<ul class="errors">{#each errors as field}<li><a href={fieldLink(field)} onclick={event=>{event.preventDefault();void focusError(field);}}>{label(field)}: {i18n.t('inventory.edit.invalidField')}</a></li>{/each}</ul>{/if}
   {#if state.conflict||state.uncertain}<button type="button" disabled={state.busy} onclick={()=>workspace?.recover()}>{i18n.t('inventory.edit.review')}</button>{/if}
   {#if state.latest}<section aria-label={i18n.t('inventory.edit.review')}>
    {#each comparison as field}{#if state.latest.attributes[field]!==draft[field]}<h3>{label(field)}</h3><dl><dt>{i18n.t('inventory.edit.current')}</dt><dd>{display(state.latest.attributes,field)}</dd><dt>{i18n.t('inventory.edit.yours')}</dt><dd>{display(draft,field)}</dd></dl>{/if}{/each}
    <button type="button" onclick={()=>workspace?.keepEdits()}>{i18n.t('inventory.edit.keep')}</button><button type="button" onclick={()=>workspace?.useLatest()}>{i18n.t('inventory.edit.useLatest')}</button>
   </section>{/if}
   <footer><button type="submit" disabled={state.busy||state.conflict}>{i18n.t('inventory.edit.save')}</button></footer>
  </form>
  {#if workspace&&state.baseline&&!state.denied}{#key historyScope(workspace.recordID())}<InventoryScanLabel {dealerID} recordID={workspace.recordID()} stock={state.baseline.attributes.stock_number} title={inventoryScanLabelTitle(state.baseline.attributes)} {apiURL} {credential} {i18n} {onSessionRejected} /><InventoryHistory {accountId} {dealerID} recordID={workspace.recordID()} {apiURL} {credential} {i18n} {onSessionRejected} />{/key}{/if}
  {#if workspace&&state.baseline}{#key workspace.recordID()}<InventoryPublication {workspace} {accountId} {dealerID} recordID={workspace.recordID()} {apiURL} {credential} {i18n} {onSessionRejected} otherBusy={photosBusy||voiceBusy} publishReady={!state.restored&&!state.invalid&&!state.conflict&&!state.uncertain} onBusy={value=>publicationBusy=value} />{/key}{/if}
 {/if}
</section>
<style>
 section{overflow-wrap:anywhere}h2{font-size:1.65rem}fieldset{border:0;border-top:1px solid #cbd6cf;padding:1rem 0;margin:1.5rem 0}legend{font-weight:650;padding-right:.75rem}label{display:block;margin:1rem 0 .4rem}input,textarea,select,button{font:inherit;min-height:44px;border:1px solid #9caf9f;border-radius:.5rem;padding:.65rem;background:white;color:#183e32;box-sizing:border-box}input,textarea,select{width:100%}input[aria-invalid=true]{border:2px solid #a52828}.toggle{display:flex;gap:.7rem;align-items:center}.toggle input{width:1.25rem;min-height:1.25rem}.hint{color:#52645e;line-height:1.5}.save-state{padding:.8rem;border:1px solid #cbd6cf;border-radius:.5rem;background:#f7f9f6}.date-fields{display:grid;grid-template-columns:2fr 1fr 1fr;gap:1rem}summary{cursor:pointer;font-weight:650;padding:1rem 0;min-height:44px}button{cursor:pointer;margin:.3rem .5rem .3rem 0}button:disabled{opacity:.55}footer{padding:1rem 0}footer button{background:#245b43;color:white}:is(button,input,textarea,select,summary):focus-visible{outline:3px solid #246aab;outline-offset:3px}dd{white-space:pre-wrap;margin:.35rem 0 1rem}.errors a{color:#8a2525}textarea{resize:vertical}
</style>
