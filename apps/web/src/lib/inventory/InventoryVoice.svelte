<script lang="ts">
 import {sessionScopedFailure} from '@pianotechpros/api-client';
 import {onMount,tick} from 'svelte';
 import {createInventoryVoiceApiClient,VoiceClientError} from '@pianotechpros/api-client';
 import {createInventoryVoiceWorkspace,inventoryFormFromAttributes,type InventoryForm,type InventoryFormWorkspace,type InventoryVoiceCandidate,type InventoryVoiceField,type InventoryVoiceState,type SessionCredential} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import {browserEvents} from '../browser-events';
 import {createBrowserVoiceRecorder,type VoiceCaptureState,type BrowserVoiceAudio} from './voice-recorder';
 export let workspace:InventoryFormWorkspace;export let accountId:string;export let dealerID:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;export let onBusy:(busy:boolean)=>void;export let onPaused:(paused:boolean)=>void;export let otherBusy=false;
 let active=false,working=false,denied=false;let transcript='',failure='';let selected:InventoryVoiceField[]=[];
 let clarificationField:InventoryVoiceField|null=null,answer='';
 let capture:VoiceCaptureState={phase:'idle',issue:null,level:null};let voice:InventoryVoiceState|null=null;let heading:HTMLHeadingElement;
 let recorder:ReturnType<typeof createBrowserVoiceRecorder>|null=null;let workflow:ReturnType<typeof createInventoryVoiceWorkspace>|null=null;
 let unsubscribe=()=>{};
 $: capturing=['requesting','recording','stopping'].includes(capture.phase);
 $: busy=working||capturing;
 $: onBusy(busy);
 $: issue=failure||(voice?.phase==='applied'&&voice.conflicts.length?'undoConflict':voice?.issue)||'';
 $: reviewing=voice?.phase==='review';
 const label=(field:InventoryVoiceField)=>i18n.t(field==='manufactured'?'inventory.edit.date':`inventory.field.${field==='asking_price'?'asking_amount':field==='acquisition_cost'?'cost_amount':field}` as MessageKey);
 function value(form:InventoryForm,field:InventoryVoiceField){
  if(field==='manufactured')return i18n.t('voice.dateValue',{year:form.year||i18n.t('inventory.edit.unknown'),month:form.month||i18n.t('inventory.edit.unknown'),day:form.day||i18n.t('inventory.edit.unknown')});
  if(field==='asking_price'||field==='acquisition_cost')return i18n.t('voice.moneyValue',{amount:(field==='asking_price'?form.asking_amount:form.cost_amount)||i18n.t('inventory.edit.unknown'),currency:field==='asking_price'?form.asking_currency:form.cost_currency});
  const v=form[field];if(typeof v==='boolean')return i18n.t(v?'inventory.edit.yes':'inventory.edit.no');if(!v)return i18n.t('inventory.edit.unknown');
  return field==='form'||field==='condition'?i18n.t(`inventory.${field}.${v}` as MessageKey):v;
 }
 function proposed(c:InventoryVoiceCandidate){const v=c.value;return value(inventoryFormFromAttributes({stock_number:'', [c.field]:v.text??v.boolean??v.money??v.date},voice?.reviewed?.decimal??'.'),c.field);}
 function clear(){clarificationField=null;answer='';recorder?.cancel();workflow?.cancel();voice=null;selected=[];transcript='';failure='';}
 async function request<T>(run:(client:ReturnType<typeof createInventoryVoiceApiClient>)=>Promise<T>){
  const session=credential;
  try{return await run(createInventoryVoiceApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}
  catch(error){error=sessionScopedFailure(error,session.token,credential.token);if(error instanceof VoiceClientError&&['unauthenticated','not_found'].includes(error.code)){denied=true;failure='denied';transcript='';clarificationField=null;answer='';workflow?.cancel();voice=null;if(active&&session.token===credential.token&&error.code==='unauthenticated')onSessionRejected();}throw error;}
 }
 async function process(audio:BrowserVoiceAudio|null=null){
  if(!active||working||otherBusy||denied){audio?.bytes.fill(0);return;}
  const text=transcript.trim();clear();transcript=text;
  if(audio)await workflow?.process(audio.bytes,audio.mimeType);else await workflow?.extractTranscript(text);
 }
 function apply(){workflow?.apply(selected);if(workflow?.snapshot().voice?.phase==='applied')transcript='';}
 async function clarify(){
  if(!workflow||!clarificationField||voice?.busy)return;
  const field=clarificationField;selected=selected.filter(value=>value!==field);
  await workflow.clarify(field,answer.trim());
  if(active&&!workflow.snapshot().voice?.issue){clarificationField=null;answer='';await tick();heading?.focus();}
 }
 function editTranscript(){const text=voice?.transcript??transcript;clear();transcript=text;}
 function renew(){workflow?.refreshReview();selected=[];void tick().then(()=>heading?.focus());}
 onMount(()=>{
  active=true;
  workflow=createInventoryVoiceWorkspace({accountID:accountId,dealerID,active:()=>active&&!denied,
   snapshot:()=>workspace.snapshot(),change:(form,fields)=>workspace.change(form,fields),withMutation:work=>workspace.withMediaMutation(work),
   ...('ensureRecord'in workspace?{ensureRecord:()=> (workspace.ensureRecord as ()=>Promise<string|null>)()}:{}),
   transcribe:(recordID,revision,bytes,mime,signal)=>request(client=>client.transcribe(dealerID,recordID,revision,bytes,mime,signal)),
   extract:(recordID,revision,text,signal)=>request(client=>client.extract(dealerID,recordID,revision,text,signal)),
   classify:error=>error instanceof VoiceClientError?error.code==='unauthenticated'||error.code==='not_found'?'denied':error.code==='cancelled'?'unavailable':error.code:'unavailable',
  });
  unsubscribe=workflow.subscribe(next=>{if(!active)return;const entered=next.voice?.phase==='review'&&voice?.phase!=='review';voice=next.voice;working=next.busy;onPaused(next.paused);if(next.issue)failure=next.issue;if(next.issue==='denied'){clarificationField=null;answer='';transcript='';selected=[];}if(voice?.transcript)transcript=voice.transcript;if(entered){selected=[];void tick().then(()=>{if(active)heading?.focus();});}});
  const events=browserEvents('pianotechpros.voice');const hidden=()=>{if(!events.visible())clear();};events.addVisibility(hidden);
  recorder=createBrowserVoiceRecorder({changed:state=>{if(active)capture=state;},completed:audio=>{if(active)void process(audio);else audio.bytes.fill(0);}});
  const unwatch=workspace.subscribe(state=>{if(state.denied){clear();denied=true;failure='denied';}});
  return()=>{active=false;clear();unsubscribe();workflow?.dispose();unwatch();recorder?.dispose();events.removeVisibility(hidden);onBusy(false);onPaused(false);};
 });
</script>

<section aria-label={i18n.t('voice.title')} class="voice-panel">
 <h3>{i18n.t('voice.title')}</h3><p class="hint">{i18n.t('voice.hint')}</p>
 {#if capturing}
  <p role="status">{i18n.t(`voice.capture.${capture.phase}` as MessageKey)}</p>
  {#if capture.phase==='recording'}{#if capture.level===null}<p>{i18n.t('voice.levelUnavailable')}</p>{:else}<label>{i18n.t('voice.inputLevel')}<meter min="0" max="100" value={capture.level} aria-label={i18n.t('voice.inputLevel')}></meter></label>{/if}<button type="button" onclick={()=>recorder?.stop()}>{i18n.t('voice.stop')}</button>{/if}
 {:else if !working}
  <button type="button" disabled={otherBusy||denied} onclick={()=>{failure='';void recorder?.start();}}>{i18n.t('voice.record')}</button>
 {/if}
 {#if capture.issue}<p role="alert">{i18n.t(`voice.captureError.${capture.issue}` as MessageKey)}</p>{/if}
 {#if voice?.phase==='transcribing'||voice?.phase==='extracting'}<p role="status">{i18n.t(`voice.${voice.phase}` as MessageKey)}</p>{/if}
 {#if working&&!voice}<p role="status">{i18n.t('voice.preparing')}</p>{/if}
 {#if issue}<p role="alert">{i18n.t(`voice.error.${issue}` as MessageKey)}</p>{/if}
 {#if reviewing&&voice?.proposal&&voice.reviewed}
  <h4 tabindex="-1" bind:this={heading}>{i18n.t('voice.review')}</h4>
  <details><summary>{i18n.t('voice.transcript')}</summary><p class="transcript">{voice.transcript}</p></details>
  {#if !voice.proposal.candidates.length}<p>{i18n.t('voice.empty')}</p>{/if}
  {#each voice.proposal.candidates as candidate}
   <article>
    <label class="choice"><input type="checkbox" disabled={voice.busy} checked={selected.includes(candidate.field)} onchange={event=>selected=event.currentTarget.checked?[...selected,candidate.field]:selected.filter(field=>field!==candidate.field)} />{i18n.t('voice.select',{field:label(candidate.field)})}</label>
    <dl><div><dt>{i18n.t('voice.current')}</dt><dd>{value(voice.reviewed,candidate.field)}</dd></div><div><dt>{i18n.t('voice.proposed')}</dt><dd>{proposed(candidate)}</dd></div></dl>
    <p class="confidence">{i18n.t(`voice.confidence.${candidate.confidence}` as MessageKey)}</p><blockquote>{candidate.evidence}</blockquote>
    <button type="button" disabled={voice.busy} onclick={()=>{clarificationField=candidate.field;answer='';void tick().then(()=>document.getElementById('voice-clarification')?.focus());}}>{i18n.t('voice.clarify',{field:label(candidate.field)})}</button>
    {#if clarificationField===candidate.field}
     <label for="voice-clarification">{i18n.t('voice.clarification',{field:label(candidate.field)})}</label>
     <textarea id="voice-clarification" bind:value={answer} rows="2" maxlength="16000" disabled={voice.busy}></textarea>
     <button type="button" disabled={voice.busy||!answer.trim()} onclick={()=>void clarify()}>{i18n.t('voice.clarifySubmit')}</button>
    {/if}
   </article>
  {/each}
  {#if voice.busy}<p role="status">{i18n.t('voice.clarifying')}</p>{/if}
  {#if voice.conflicts.length}<button type="button" disabled={voice.busy} onclick={renew}>{i18n.t('voice.renew')}</button>{/if}
  <button type="button" class="primary" disabled={voice.busy||!selected.length} onclick={apply}>{i18n.t('voice.apply')}</button>
  <button type="button" onclick={editTranscript}>{i18n.t('voice.editTranscript')}</button>
 {:else if !busy}
  <label for="voice-transcript">{i18n.t('voice.transcript')}</label><textarea id="voice-transcript" bind:value={transcript} rows="3" maxlength="32000" disabled={denied}></textarea>
  <button type="button" disabled={otherBusy||denied||!transcript.trim()} onclick={()=>void process()}>{i18n.t('voice.extract')}</button>
 {/if}
 {#if busy||reviewing||transcript}<button type="button" onclick={clear}>{i18n.t('voice.cancel')}</button>{/if}
 {#if voice?.phase==='applied'}<p role="status">{i18n.t('voice.applied')}</p>{/if}
 {#if voice?.canUndo}<button type="button" disabled={busy||otherBusy} onclick={()=>workflow?.undo()}>{i18n.t('voice.undo')}</button>{/if}
</section>
<style>
 .voice-panel{margin:1.5rem 0;padding:1rem;border:1px solid #b5c8bc;border-radius:.75rem;background:#f7f9f6;overflow-wrap:anywhere}h3{margin-top:0}h4{font-size:1.15rem}.hint,.confidence{color:#52645e;line-height:1.5}label{display:block;margin:.75rem 0}.choice{display:flex;gap:.75rem;align-items:center;min-height:44px;font-weight:650}input{width:1.3rem;height:1.3rem;flex-shrink:0}textarea,button{font:inherit;min-height:44px;border:1px solid #9caf9f;border-radius:.5rem;padding:.65rem;background:white;color:#183e32;box-sizing:border-box}textarea{width:100%;resize:vertical}button{cursor:pointer;margin:.3rem .5rem .3rem 0}.primary{background:#245b43;color:white}button:disabled{opacity:.55}article{border-top:1px solid #cbd6cf;padding:.75rem 0}dl{display:grid;grid-template-columns:1fr 1fr;gap:1rem}dt{font-weight:650}dd{margin:.4rem 0;white-space:pre-wrap}blockquote{margin:.5rem 0;padding-left:1rem;border-left:3px solid #9caf9f;white-space:pre-wrap}.transcript{white-space:pre-wrap}summary{cursor:pointer;min-height:44px;padding:.5rem 0;box-sizing:border-box}:is(button,input,textarea,summary):focus-visible,h4:focus{outline:3px solid #246aab;outline-offset:3px}@media(max-width:550px){dl{grid-template-columns:1fr}}
</style>
