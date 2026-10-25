<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {createTechnicianProfileApiClient,TechnicianProfileClientError,sessionScopedFailure} from '@pianotechpros/api-client';
 import {openTechnicianWorkspace,TechnicianWorkspaceError,emptyTechnicianForm,addTechnicianRule,removeTechnicianRule,technicianServices,technicianPianoForms,technicianComparison,type TechnicianForm,type TechnicianWorkspace,type TechnicianEditorState,type TechnicianComparisonValue,type SessionCredential} from '@pianotechpros/client-core';
 import {technicianContactFields,technicianOriginFields,technicianFieldLabel,type Translator,type MessageKey} from '@pianotechpros/i18n';
 import {browserTechnicianOwnership} from './ownership';
 import {openBrowserTechnicianRecovery} from './recovery-storage';
 import {protectPendingNavigation} from '../browser-events';
 import Field from './TechnicianField.svelte';
 export let accountId:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let active=true,loading=true;let failure:MessageKey|null=null;let workspace:TechnicianWorkspace|null=null;let state:TechnicianEditorState|null=null;let unsubscribe=()=>{};
 type Section='overview'|'contact'|'origin'|'work'|'availability'|'rule';
 let section:Section='overview',ruleKey='',search='',showIssues=false,writes=0,edited=false,removing=false;
 let confirmation:HTMLDialogElement,form:HTMLFormElement,heading:HTMLHeadingElement;
 const live=()=>active&&Date.parse(credential.expiresAt)>Date.now();
 async function request<T>(operation:(api:ReturnType<typeof createTechnicianProfileApiClient>)=>Promise<T>){
  const session=credential;
  if(!live())throw new TechnicianProfileClientError('unauthenticated',401);
  try{return await operation(createTechnicianProfileApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}
  catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(error instanceof TechnicianProfileClientError&&error.status===401){if(active)onSessionRejected();}throw error;}
 }
 async function load(){loading=true;failure=null;try{
  const result=await openTechnicianWorkspace({scope:{userID:accountId,apiBaseURL:apiURL},ownership:browserTechnicianOwnership,active:live,now:Date.now,key:()=>crypto.randomUUID(),draft:emptyTechnicianForm(),storage:()=>openBrowserTechnicianRecovery(accountId),
   isMissing:error=>error instanceof TechnicianProfileClientError&&error.code==='not_found',
   classify:error=>error instanceof TechnicianProfileClientError&&[401,403,404].includes(error.status)?'denied':error instanceof TechnicianProfileClientError&&error.code==='conflict'?'conflict':error instanceof TechnicianProfileClientError&&([400,422].includes(error.status)||error.code==='idempotency_conflict')?'rejected':'uncertain',
   api:{get:()=>request(api=>api.get()),timezones:()=>request(api=>api.timezones()),create:(a,key)=>request(api=>api.create(a,key)),save:(id,a,revision)=>request(api=>api.save(id,a,revision))}});
  if(!live()){result?.dispose();return;}workspace=result;
  if(result)unsubscribe=result.editor.subscribe(next=>{state=next;if(!next&&active){failure='technician.access';section='overview';ruleKey='';search='';removing=false;confirmation?.close();}});
 }catch(error){if(active)failure=error instanceof TechnicianWorkspaceError&&error.reason==='busy'?'technician.busy':error instanceof TechnicianWorkspaceError&&error.reason==='storage'?'technician.storage':error instanceof TechnicianWorkspaceError&&error.reason==='access'?'technician.access':'technician.unavailable';}
 finally{if(active)loading=false;}}
 async function edit(next:TechnicianForm){if(!workspace||!state)return;edited=true;writes++;try{await workspace.editor.edit(next);}finally{writes--;}}
 function change(field:string,value:string|boolean|number){if(!state)return;const next=state.draft;if(section==='origin'&&!['radiusMiles','drivingMinutes'].includes(field))Object.assign(next.origin,{[field]:value});else if(section==='rule'){const r=next.availability.find(r=>r.key===ruleKey);if(r)Object.assign(r,{[field]:value});}else Object.assign(next,{[field]:value});void edit(next);}
 function toggle(kind:'services'|'forms',value:string){if(!state)return;const next=state.draft;next[kind]=next[kind].includes(value)?next[kind].filter(v=>v!==value):[...next[kind],value];void edit(next);}
 async function select(next:Section,key=''){if(workspace&&!await workspace.protect())return;section=next;ruleKey=key;search='';showIssues=false;await tick();heading?.focus();}
 async function add(){if(!state)return;const next=addTechnicianRule(state.draft,()=>crypto.randomUUID());if(next){await edit(next);await select('rule',next.availability.at(-1)!.key);}}
 async function close(){try{if(workspace&&!await workspace.close())return;}catch{failure='technician.storage';return;}window.location.assign('/');}
 async function focusIssue(path:string){const parts=path.split('.');section=parts[0]==='origin'||['radiusMiles','drivingMinutes'].includes(parts[0])?'origin':parts[0]==='availability'?(parts.length===3?'rule':'availability'):['services','forms','searchable','acceptsRequestsWithoutAvailability'].includes(parts[0])?'work':'contact';ruleKey=parts.length===3?parts[1]:'';showIssues=true;search='';await tick();const input=form?.elements.namedItem(path);if(input&&'focus' in input)(input as HTMLElement).focus();else heading?.focus();}
 async function save(){if(!workspace||!state)return;showIssues=true;if(!state.pending&&state.issues.length){await focusIssue(state.issues[0].path);return;}await workspace.editor.save();}
 async function confirmRemoval(){removing=true;await tick();confirmation?.showModal();}
 async function remove(){if(!state)return;const next=removeTechnicianRule(state.draft,ruleKey,true);confirmation.close();removing=false;if(next){await edit(next);await select('availability');}}
 const invalid=(path:string)=>showIssues&&!!state?.issues.some(i=>i.path===path);
 const day=(n:number)=>i18n.t(`technician.day.${n}` as MessageKey);
 const label=(path:string)=>i18n.t(technicianFieldLabel(path));
 function display(value:TechnicianComparisonValue,path:string):string{if(value===null)return i18n.t('technician.absent');if(typeof value==='boolean')return i18n.t(value?'technician.yes':'technician.no');if(typeof value==='number')return path.endsWith('.weekday')?day(value):i18n.number(value);if(typeof value==='object')return value.map(v=>i18n.t(`technician.${path==='services'?'service':'form'}.${v}` as MessageKey)).join(', ')||i18n.t('technician.empty');return !value?i18n.t('technician.empty'):path.endsWith('.kind')?i18n.t(`technician.kind.${value}` as MessageKey):value;}
 $: rule=state?.draft.availability.find(r=>r.key===ruleKey);
 $: timezone=section==='rule'?rule?.timezone??'':state?.draft.origin.timezone??'';
 $: zonePath=section==='rule'?'availability.'+ruleKey+'.timezone':'origin.timezone';
 $: zones=(workspace?.timezones()??[]).filter(z=>z.toLowerCase().includes(search.toLowerCase()));
 $: comparison=state?.latest?technicianComparison(state.latest.attributes,state.draft):[];
 $: if(!state&&removing){confirmation?.close();removing=false;ruleKey='';}
 onMount(()=>{const stop=protectPendingNavigation(()=>writes>0||state?.failure==='storage');void load();return()=>{active=false;confirmation?.close();stop();unsubscribe();workspace?.dispose();};});
</script>
<section class="technician">
 <header><div><p class="eyebrow">{i18n.t('technician.heading')}</p><h2 bind:this={heading} tabindex="-1">{section==='rule'&&rule?day(rule.weekday):i18n.t(`technician.${section==='rule'?'availability':section}` as MessageKey)}</h2></div><button onclick={()=>section==='overview'?close():select(section==='rule'?'availability':'overview')} disabled={writes>0}>{i18n.t(section==='overview'?'technician.close':'technician.back')}</button></header>
 {#if loading}<p role="status">{i18n.t('common.loading')}</p>{:else if !state}<p role="alert">{i18n.t(failure??'technician.access')}</p>{#if !workspace}<button onclick={load}>{i18n.t('technician.retry')}</button>{/if}
 {:else}
 <p class="hint">{i18n.t('technician.intro')}</p>
 {#if workspace?.restored&&(state.dirty||state.pending||state.conflict)}<p role="status">{i18n.t('technician.restored')}</p>{/if}
 {#if workspace?.recoveryNotice}<p role="status">{i18n.t(workspace.recoveryNotice==='expired'?'technician.expired':'technician.invalidDraft')}</p>{/if}
 <p class="status" role="status">{i18n.t(writes?'technician.savingDraft':state.failure?`technician.${state.failure}` as MessageKey:state.busy?'technician.saving':state.pending?'technician.uncertain':state.conflict?'technician.conflict':state.dirty?(edited||workspace?.restored?'technician.draftReady':'technician.start'):'technician.saved')}</p>
 {#if state.failure==='storage'}<button onclick={()=>state&&edit(state.draft)}>{i18n.t('technician.retry')}</button>{/if}
 <form bind:this={form} novalidate onsubmit={e=>{e.preventDefault();void save();}}>
 {#if section==='overview'}
  {#each ['contact','origin','work','availability'] as part}<button type="button" class="row" onclick={()=>select(part as Section)}>{i18n.t(`technician.${part}` as MessageKey)}</button>{/each}
 {:else if section==='contact'}
  {#each technicianContactFields as f}<Field path={f.key} value={state.draft[f.key]} required={f.required} max={f.max} invalid={invalid(f.key)} {i18n} change={v=>change(f.key,v)}/>{/each}
 {:else if section==='origin'}
  {#each technicianOriginFields as f}<Field path={'origin.'+f.key} value={state.draft.origin[f.key]} required={f.required} max={f.max} invalid={invalid('origin.'+f.key)} {i18n} change={v=>change(f.key,v)}/>{/each}
  <p>{i18n.t('technician.radiusHint')}</p>{#each ['radiusMiles','drivingMinutes'] as f}<Field path={f} value={state.draft[f as 'radiusMiles'|'drivingMinutes']} required={f==='radiusMiles'} max={16} invalid={invalid(f)} {i18n} change={v=>change(f,v)}/>{/each}
 {:else if section==='work'}
  {#each ['searchable','acceptsRequestsWithoutAvailability'] as f}<label class="toggle"><input type="checkbox" checked={state.draft[f as 'searchable'|'acceptsRequestsWithoutAvailability']} onchange={e=>change(f,e.currentTarget.checked)}/>{label(f)}</label>{/each}
  <p>{i18n.t('technician.searchableHelp')}</p>
  {#each ['services','forms'] as kind}<fieldset id={kind} name={kind} tabindex="-1"><legend>{label(kind)}</legend>{#each kind==='services'?technicianServices:technicianPianoForms as value}<label class="toggle"><input type="checkbox" checked={state.draft[kind as 'services'|'forms'].includes(value)} onchange={()=>toggle(kind as 'services'|'forms',value)}/>{i18n.t(`technician.${kind==='services'?'service':'form'}.${value}` as MessageKey)}</label>{/each}</fieldset>{/each}
 {:else if section==='availability'}
  {#each state.draft.availability as r}<button type="button" class="row" onclick={()=>select('rule',r.key)}><strong>{day(r.weekday)}</strong><span>{i18n.t(`technician.kind.${r.kind}` as MessageKey)} · {r.start}–{r.end} · {r.timezone}</span></button>{/each}
  {#if !state.draft.availability.length}<p>{i18n.t('technician.noRules')}</p>{/if}
  <button id="availability" name="availability" type="button" disabled={state.draft.availability.length>=7} onclick={add}>{i18n.t('technician.addRule')}</button>
 {:else if section==='rule'&&rule}
  <label for={'availability.'+ruleKey+'.weekday'}>{label('weekday')}</label><select id={'availability.'+ruleKey+'.weekday'} name={'availability.'+ruleKey+'.weekday'} value={rule.weekday} onchange={e=>change('weekday',Number(e.currentTarget.value))}>{#each [0,1,2,3,4,5,6] as n}<option value={n} disabled={state.draft.availability.some(r=>r.key!==ruleKey&&r.weekday===n)}>{day(n)}</option>{/each}</select>
  <label for={'availability.'+ruleKey+'.kind'}>{label('kind')}</label><select id={'availability.'+ruleKey+'.kind'} name={'availability.'+ruleKey+'.kind'} value={rule.kind} onchange={e=>change('kind',e.currentTarget.value)}>{#each ['available','unavailable'] as value}<option {value}>{i18n.t(`technician.kind.${value}` as MessageKey)}</option>{/each}</select>
  <p>{i18n.t('technician.timeHint')}</p>{#each ['start','end','effectiveStart','effectiveEnd'] as f}<Field path={'availability.'+ruleKey+'.'+f} value={rule[f as 'start'|'end'|'effectiveStart'|'effectiveEnd']} required={f==='start'||f==='end'} max={16} invalid={invalid('availability.'+ruleKey+'.'+f)} {i18n} change={v=>change(f,v)}/>{/each}
 {/if}
 {#if section==='origin'||section==='rule'&&rule}
  <label for="timezone-search">{i18n.t('technician.searchTimezone')}</label><input id="timezone-search" type="search" bind:value={search}/>
  <label for={zonePath}>{label('timezone')} ({i18n.t('technician.required')})</label><select id={zonePath} name={zonePath} value={timezone} aria-required="true" aria-invalid={invalid(zonePath)} onchange={e=>change('timezone',e.currentTarget.value)}><option value="">{i18n.t('technician.select')}</option>{#if timezone&&!zones.includes(timezone)}<option value={timezone}>{timezone}</option>{/if}{#each zones as zone}<option value={zone}>{zone}</option>{/each}</select>
  {#if !zones.length}<p>{i18n.t('technician.noTimezones')}</p>{/if}
 {/if}
 {#if section==='rule'&&rule}<button type="button" class="danger" onclick={confirmRemoval}>{i18n.t('technician.remove')}</button>{/if}
 {#if showIssues&&state.issues.length}<section class="errors" role="alert"><h3>{i18n.t('technician.invalid')}</h3><ul>{#each state.issues as issue}<li><button type="button" onclick={()=>focusIssue(issue.path)}>{label(issue.path)}</button></li>{/each}</ul></section>{/if}
 {#if state.conflict}<p>{i18n.t('technician.conflict')}</p><button type="button" disabled={state.busy} onclick={()=>workspace?.editor.review()}>{i18n.t('technician.review')}</button>{/if}
 {#if state.latest}<section aria-label={i18n.t('technician.review')}>{#each comparison as difference}<h3>{difference.weekday===undefined?'':day(difference.weekday)} {label(difference.path)}</h3><dl><dt>{i18n.t('technician.current')}</dt><dd>{display(difference.current,difference.path)}</dd><dt>{i18n.t('technician.yours')}</dt><dd>{display(difference.yours,difference.path)}</dd></dl>{/each}<button type="button" disabled={state.busy} onclick={()=>workspace?.editor.keepEdits()}>{i18n.t('technician.keep')}</button><button type="button" disabled={state.busy} onclick={()=>{section='overview';void workspace?.editor.useLatest();}}>{i18n.t('technician.useLatest')}</button></section>{/if}
 <footer><button class="primary" type="submit" disabled={state.busy||state.conflict||writes>0}>{i18n.t(state.pending?'technician.retrySave':'technician.save')}</button></footer>
 </form>
 {/if}
 <dialog bind:this={confirmation} aria-labelledby="technician-remove-title" onclose={()=>removing=false}><h2 id="technician-remove-title">{i18n.t('technician.removeTitle')}</h2>{#if removing&&rule&&state}<p>{i18n.t('technician.removeHelp',{day:day(rule.weekday)})}</p>{/if}<button onclick={()=>confirmation.close()}>{i18n.t('technician.cancel')}</button><button class="danger" onclick={remove}>{i18n.t('technician.remove')}</button></dialog>
</section>
<style>
.technician{max-width:48rem;margin:auto;overflow-wrap:anywhere}header{display:flex;gap:1rem;align-items:center;justify-content:space-between}h2{font-size:1.7rem;margin:.3rem 0}h3{font-size:1.2rem}.eyebrow,.hint{color:#52645e;line-height:1.5}.eyebrow{font-size:.9rem}button,input,select{font:inherit;min-height:44px;border:1px solid #8c9f94;border-radius:.5rem;padding:.7rem;background:white;color:#183e32;box-sizing:border-box}button{cursor:pointer;margin:.35rem .5rem .35rem 0}button:disabled{opacity:.55;cursor:default}input,select{width:100%}label{display:block;margin:1rem 0 .4rem}fieldset{border:0;padding:0;margin:1.5rem 0}legend{font-weight:650}.toggle{display:flex;align-items:center;gap:.7rem}.toggle input{width:1.25rem;min-height:1.25rem}.row{display:flex;width:100%;flex-direction:column;text-align:left;gap:.4rem;padding:1rem}.row span{color:#52645e}.status{padding:1rem;border:1px solid #cbd6cf;border-radius:.5rem;background:#f7f9f6}section section{margin:2rem 0}footer{background:#fff;padding:1rem 0;border-top:1px solid #cbd6cf}.primary{background:#245b43;color:white}.danger,.errors button{color:#8a2525}dialog{max-width:28rem;border:1px solid #8c9f94;border-radius:.75rem;padding:1.5rem;color:#183e32}dialog::backdrop{background:#142a2266}dd{margin:.4rem 0 1rem;white-space:pre-wrap}:is(button,input,select):focus-visible{outline:3px solid #246aab;outline-offset:3px}[aria-invalid=true]{border:2px solid #a52828}@media(max-width:480px){header{align-items:flex-start;flex-direction:column}}
</style>
