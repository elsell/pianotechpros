<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {createCustomerProfileApiClient,CustomerProfileClientError} from '@pianotechpros/api-client';
 import {openCustomerWorkspace,CustomerWorkspaceError,emptyCustomerForm,addCustomerLocation,addCustomerPiano,removeCustomerLocation,removeCustomerPiano,customerPianoForms,customerComparison,type CustomerForm,type CustomerWorkspace,type CustomerEditorState,type SessionCredential} from '@pianotechpros/client-core';
 import {customerContactFields,customerLocationFields,customerPianoFields,customerFieldLabel,type Translator,type MessageKey} from '@pianotechpros/i18n';
 import {browserCustomerOwnership} from './ownership';
 import {openBrowserCustomerRecovery} from './recovery-storage';
 import {protectPendingNavigation} from '../browser-events';
 import Field from './CustomerField.svelte';
 export let accountId:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let active=true,loading=true;let failure:MessageKey|null=null;let workspace:CustomerWorkspace|null=null;let state:CustomerEditorState|null=null;let unsubscribe=()=>{};
 type Section={kind:'locations'|'pianos';key:string}|null;
 let section:Section=null;let edited=false;let writes=0,showIssues=false;let search='';let removing:Section=null;let confirmation:HTMLDialogElement;let form:HTMLFormElement;let heading:HTMLHeadingElement;
 const live=()=>active&&Date.parse(credential.expiresAt)>Date.now();
 async function request<T>(operation:(api:ReturnType<typeof createCustomerProfileApiClient>)=>Promise<T>){
  const session=credential;
  if(!live())throw new CustomerProfileClientError('unauthenticated',401);
  try{return await operation(createCustomerProfileApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}
  catch(error){if(error instanceof CustomerProfileClientError&&error.status===401){if(session.token!==credential.token)throw new CustomerProfileClientError('unavailable',503);if(active)onSessionRejected();}throw error;}
 }
 async function load(){loading=true;failure=null;try{
  const result=await openCustomerWorkspace({scope:{userID:accountId,apiBaseURL:apiURL},ownership:browserCustomerOwnership,active:live,now:Date.now,key:()=>crypto.randomUUID(),draft:emptyCustomerForm(),storage:()=>openBrowserCustomerRecovery(accountId),
   isMissing:error=>error instanceof CustomerProfileClientError&&error.code==='not_found',
   classify:error=>error instanceof CustomerProfileClientError&&[401,403,404].includes(error.status)?'denied':error instanceof CustomerProfileClientError&&error.code==='conflict'?'conflict':error instanceof CustomerProfileClientError&&([400,422].includes(error.status)||error.code==='idempotency_conflict')?'rejected':'uncertain',
   api:{get:()=>request(api=>api.get()),timezones:()=>request(api=>api.timezones()),create:(a,key)=>request(api=>api.create(a,key)),save:(id,a,revision)=>request(api=>api.save(id,a,revision))}});
  if(!live()){result?.dispose();return;}workspace=result;
  if(result)unsubscribe=result.editor.subscribe(next=>{state=next;if(!next&&active)failure='customer.access';});
 }catch(error){if(active)failure=error instanceof CustomerWorkspaceError&&error.reason==='busy'?'customer.busy':error instanceof CustomerWorkspaceError&&error.reason==='storage'?'customer.storage':error instanceof CustomerWorkspaceError&&error.reason==='access'?'customer.access':'customer.unavailable';}
 finally{if(active)loading=false;}}
 async function edit(next:CustomerForm){if(!workspace||!state)return;edited=true;writes++;try{await workspace.editor.edit(next);}finally{writes--;}}
 function change(field:string,value:string|boolean){if(!state)return;const next=state.draft;if(section){const row=next[section.kind].find(row=>row.key===section!.key);if(row)Object.assign(row,{[field]:value});}else Object.assign(next,{[field]:value});void edit(next);}
 async function select(next:Section){if(workspace&&!await workspace.protect())return;section=next;search='';showIssues=false;await tick();heading?.focus();}
 async function add(kind:'locations'|'pianos'){
  if(!state)return;const next=kind==='locations'?addCustomerLocation(state.draft,()=>crypto.randomUUID()):addCustomerPiano(state.draft,state.draft.locations[0]?.key??'',()=>crypto.randomUUID());
  if(!next)return;await edit(next);await select({kind,key:next[kind].at(-1)!.key});
 }
 async function close(){if(workspace){try{if(!await workspace.close())return;}catch{failure='customer.storage';return;}}window.location.assign('/');}
 async function focusIssue(path:string){const parts=path.split('.');section=parts.length===3?{kind:parts[0] as 'locations'|'pianos',key:parts[1]}:null;showIssues=true;search='';await tick();const input=form?.elements.namedItem(path);if(input&&'focus' in input)(input as HTMLElement).focus();else heading?.focus();}
 async function save(){if(!workspace||!state)return;showIssues=true;if(!state.pending&&state.issues.length){await focusIssue(state.issues[0].path);return;}await workspace.editor.save();}
 async function remove(){if(!state||!removing)return;const next=removing.kind==='locations'?removeCustomerLocation(state.draft,removing.key,true):removeCustomerPiano(state.draft,removing.key,true);confirmation.close();removing=null;if(next){await edit(next);await select(null);}}
 async function confirmRemoval(){if(!section)return;removing={...section};await tick();confirmation.showModal();}
 const display=(value:string|boolean|null,path:string)=>value===null?i18n.t('customer.absent'):typeof value==='boolean'?i18n.t(value?'customer.yes':'customer.no'):!value?i18n.t('customer.empty'):path.endsWith('.form')?i18n.t(`customer.form.${value}` as MessageKey):value;
 const invalid=(path:string)=>showIssues&&!!state?.issues.some(issue=>issue.path===path);
 $: location=section?.kind==='locations'?state?.draft.locations.find(row=>row.key===section?.key):undefined;
 $: piano=section?.kind==='pianos'?state?.draft.pianos.find(row=>row.key===section?.key):undefined;
 $: zones=(workspace?.timezones()??[]).filter(zone=>zone.toLowerCase().includes(search.toLowerCase()));
 $: comparison=state?.latest?customerComparison(state.latest.attributes,state.draft):[];
 onMount(()=>{const unprotect=protectPendingNavigation(()=>writes>0||state?.failure==='storage');void load();return()=>{active=false;unprotect();unsubscribe();workspace?.dispose();};});
</script>
<section class="customer">
 <header><div><p class="eyebrow">{i18n.t('customer.heading')}</p><h2 bind:this={heading} tabindex="-1">{i18n.t(section?.kind==='locations'?'customer.locations':section?.kind==='pianos'?'customer.pianos':'customer.contact')}</h2></div><button onclick={()=>section?select(null):close()} disabled={writes>0}>{i18n.t(section?'customer.back':'customer.close')}</button></header>
 {#if loading}<p role="status">{i18n.t('common.loading')}</p>
 {:else if !state}<p role="alert">{i18n.t(failure??'customer.access')}</p>{#if !workspace}<button onclick={load}>{i18n.t('customer.retry')}</button>{/if}
 {:else}
 <p class="hint">{i18n.t('customer.intro')}</p>
 {#if workspace?.restored&&(state.dirty||state.pending||state.conflict)}<p role="status">{i18n.t('customer.restored')}</p>{/if}
 {#if workspace?.recoveryNotice}<p role="status">{i18n.t(workspace.recoveryNotice==='expired'?'customer.expired':'customer.invalidDraft')}</p>{/if}
 <p class="status" role="status">{i18n.t(writes?'customer.savingDraft':state.failure?`customer.${state.failure}` as MessageKey:state.busy?'customer.saving':state.pending?'customer.uncertain':state.conflict?'customer.conflict':state.dirty?(edited||workspace?.restored?'customer.draftReady':'customer.start'):'customer.saved')}</p>
 {#if state.failure==='storage'}<button onclick={()=>state&&edit(state.draft)}>{i18n.t('customer.retry')}</button>{/if}
 <form bind:this={form} novalidate onsubmit={e=>{e.preventDefault();void save();}}>
 {#if !section}
  <fieldset><legend>{i18n.t('customer.contact')}</legend>
   <label class="toggle"><input type="checkbox" checked={state.draft.isBusiness} onchange={e=>change('isBusiness',e.currentTarget.checked)} />{i18n.t('customer.field.isBusiness')}</label>
   {#each customerContactFields as field}{#if field.key!=='businessName'||state.draft.isBusiness||!!state.draft.businessName||invalid('businessName')}<Field path={field.key} value={state.draft[field.key]} required={field.key==='businessName'?state.draft.isBusiness:field.required} max={field.max} invalid={invalid(field.key)} {i18n} change={value=>change(field.key,value)} />{/if}{/each}
  </fieldset>
  <section aria-labelledby="customer-locations"><h3 id="customer-locations">{i18n.t('customer.locations')}</h3>
   {#each state.draft.locations as row}<button type="button" class="row" onclick={()=>select({kind:'locations',key:row.key})}><strong>{row.label||i18n.t('customer.newLocation')}</strong><span>{[row.street1,row.city].filter(Boolean).join(', ')}</span></button>{/each}
   {#if !state.draft.locations.length}<p>{i18n.t('customer.firstLocation')}</p>{/if}
   <button type="button" id="locations" name="locations" disabled={state.draft.locations.length>=50} onclick={()=>add('locations')}>{i18n.t('customer.addLocation')}</button>
  </section>
  <section aria-labelledby="customer-pianos"><h3 id="customer-pianos">{i18n.t('customer.pianos')}</h3>
   {#each state.draft.pianos as row}<button type="button" class="row" onclick={()=>select({kind:'pianos',key:row.key})}><strong>{row.nickname||i18n.t('customer.newPiano')}</strong><span>{state.draft.locations.find(l=>l.key===row.locationKey)?.label}</span></button>{/each}
   {#if !state.draft.pianos.length}<p>{i18n.t('customer.noPianos')}</p>{/if}
   <button type="button" disabled={!state.draft.locations.length||state.draft.pianos.length>=200} onclick={()=>add('pianos')}>{i18n.t('customer.addPiano')}</button>
  </section>
 {:else if location}
  {#each customerLocationFields as field}<Field path={'locations.'+location.key+'.'+field.key} value={location[field.key]} required={field.required} max={field.max} invalid={invalid('locations.'+location.key+'.'+field.key)} {i18n} change={value=>change(field.key,value)} />{/each}
  <label for="timezone-search">{i18n.t('customer.searchTimezone')}</label><input id="timezone-search" type="search" bind:value={search} />
  <label for={'locations.'+location.key+'.timezone'}>{i18n.t('customer.field.timezone')} ({i18n.t('customer.required')})</label>
  <select id={'locations.'+location.key+'.timezone'} name={'locations.'+location.key+'.timezone'} value={location.timezone} aria-required="true" aria-invalid={invalid('locations.'+location.key+'.timezone')} onchange={e=>change('timezone',e.currentTarget.value)}><option value="">{i18n.t('customer.select')}</option>{#if location.timezone&&!zones.includes(location.timezone)}<option value={location.timezone}>{location.timezone}</option>{/if}{#each zones as zone}<option value={zone}>{zone}</option>{/each}</select>
  {#if !zones.length}<p>{i18n.t('customer.noTimezones')}</p>{/if}
  {#if state.draft.locations.length<=1||state.draft.pianos.some(row=>row.locationKey===location.key)}<p>{i18n.t('customer.cannotRemoveLocation')}</p>{:else}<button type="button" class="danger" onclick={confirmRemoval}>{i18n.t('customer.remove')}</button>{/if}
 {:else if piano}
  {#each customerPianoFields as field}<Field path={'pianos.'+piano.key+'.'+field.key} value={piano[field.key]} required={field.required} max={field.max} invalid={invalid('pianos.'+piano.key+'.'+field.key)} {i18n} change={value=>change(field.key,value)} />{/each}
  <label for={'pianos.'+piano.key+'.locationKey'}>{i18n.t('customer.field.locationKey')} ({i18n.t('customer.required')})</label><select id={'pianos.'+piano.key+'.locationKey'} name={'pianos.'+piano.key+'.locationKey'} value={piano.locationKey} onchange={e=>change('locationKey',e.currentTarget.value)}>{#each state.draft.locations as row}<option value={row.key}>{row.label||i18n.t('customer.newLocation')}</option>{/each}</select>
  <label for={'pianos.'+piano.key+'.form'}>{i18n.t('customer.field.form')} ({i18n.t('customer.required')})</label><select id={'pianos.'+piano.key+'.form'} name={'pianos.'+piano.key+'.form'} value={piano.form} aria-invalid={invalid('pianos.'+piano.key+'.form')} onchange={e=>change('form',e.currentTarget.value)}><option value="">{i18n.t('customer.select')}</option>{#each customerPianoForms as value}<option {value}>{i18n.t(`customer.form.${value}`)}</option>{/each}</select>
  <label class="toggle"><input type="checkbox" checked={piano.player} onchange={e=>change('player',e.currentTarget.checked)} />{i18n.t('customer.field.player')}</label><button type="button" class="danger" onclick={confirmRemoval}>{i18n.t('customer.remove')}</button>
 {/if}
 {#if showIssues&&state.issues.length}<section class="errors" role="alert"><h3>{i18n.t('customer.invalid')}</h3><ul>{#each state.issues as issue}<li><button type="button" onclick={()=>focusIssue(issue.path)}>{i18n.t(customerFieldLabel(issue.path))}</button></li>{/each}</ul></section>{/if}
 {#if state.conflict}<p>{i18n.t('customer.conflict')}</p><button type="button" disabled={state.busy} onclick={()=>workspace?.editor.review()}>{i18n.t('customer.review')}</button>{/if}
 {#if state.latest}<section aria-label={i18n.t('customer.review')}>{#each comparison as difference}<h3>{difference.context} {i18n.t(customerFieldLabel(difference.path))}</h3><dl><dt>{i18n.t('customer.current')}</dt><dd>{display(difference.current,difference.path)+(difference.currentLocationPosition?i18n.t('customer.locationPosition',{number:i18n.number(difference.currentLocationPosition)}):'')}</dd><dt>{i18n.t('customer.yours')}</dt><dd>{display(difference.yours,difference.path)+(difference.yoursLocationPosition?i18n.t('customer.locationPosition',{number:i18n.number(difference.yoursLocationPosition)}):'')}</dd></dl>{/each}<button type="button" disabled={state.busy} onclick={()=>workspace?.editor.keepEdits()}>{i18n.t('customer.keep')}</button><button type="button" disabled={state.busy} onclick={()=>{section=null;void workspace?.editor.useLatest();}}>{i18n.t('customer.useLatest')}</button></section>{/if}
 <footer><button class="primary" type="submit" disabled={state.busy||state.conflict||writes>0}>{i18n.t(state.pending?'customer.retrySave':'customer.save')}</button></footer>
 </form>
 {/if}
 <dialog bind:this={confirmation} aria-labelledby="remove-title" onclose={()=>removing=null}><h2 id="remove-title">{i18n.t('customer.removeTitle')}</h2><p>{i18n.t('customer.removeHelp')}</p><button onclick={()=>confirmation.close()}>{i18n.t('customer.cancel')}</button><button class="danger" onclick={remove}>{i18n.t('customer.remove')}</button></dialog>
</section>
<style>
.customer{max-width:48rem;margin:auto;overflow-wrap:anywhere}header{display:flex;gap:1rem;align-items:center;justify-content:space-between}h2{font-size:1.7rem;margin:.3rem 0}h3{font-size:1.2rem}.eyebrow,.hint{color:#52645e;line-height:1.5}.eyebrow{font-size:.9rem}button,input,select{font:inherit;min-height:44px;border:1px solid #8c9f94;border-radius:.5rem;padding:.7rem;background:white;color:#183e32;box-sizing:border-box}button{cursor:pointer;margin:.35rem .5rem .35rem 0}button:disabled{opacity:.55;cursor:default}input,select{width:100%}label{display:block;margin:1rem 0 .4rem}fieldset{border:0;padding:0;margin:1.5rem 0}legend{font-weight:650}.toggle{display:flex;align-items:center;gap:.7rem}.toggle input{width:1.25rem;min-height:1.25rem}.row{display:flex;width:100%;flex-direction:column;text-align:left;gap:.4rem;padding:1rem}.row span{color:#52645e}.status{padding:1rem;border:1px solid #cbd6cf;border-radius:.5rem;background:#f7f9f6}section section{margin:2rem 0}footer{background:#fff;padding:1rem 0;border-top:1px solid #cbd6cf}.primary{background:#245b43;color:white}.danger,.errors button{color:#8a2525}dialog{max-width:28rem;border:1px solid #8c9f94;border-radius:.75rem;padding:1.5rem;color:#183e32}dialog::backdrop{background:#142a2266}dd{margin:.4rem 0 1rem;white-space:pre-wrap}:is(button,input,select):focus-visible{outline:3px solid #246aab;outline-offset:3px}[aria-invalid=true]{border:2px solid #a52828}@media(max-width:480px){header{align-items:flex-start;flex-direction:column}}
</style>
