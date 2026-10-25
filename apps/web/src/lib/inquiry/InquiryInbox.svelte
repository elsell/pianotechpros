<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {createInquiryInboxApiClient,InquiryClientError,type InboxInquiry} from '@pianotechpros/api-client';
 import {createInquiryWorkspace,type SessionCredential,type InquiryWorkspaceIssue} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 export let accountId:string;export let dealerID:string;export let credential:SessionCredential;export let apiURL:string;export let i18n:Translator;export let onBack:()=>void;export let onSessionRejected:()=>void;
 let active=true;let heading:HTMLHeadingElement;let detailHeading:HTMLHeadingElement;
 const workspace=createInquiryWorkspace<InboxInquiry>(error=>error instanceof InquiryClientError?error.code:'unavailable');let state=workspace.snapshot();
 const denied=(issue:InquiryWorkspaceIssue|null)=>issue==='unauthenticated'||issue==='not_found';
 const date=(value:string)=>i18n.date(new Date(value),{dateStyle:'medium',timeStyle:'short'});
 async function request<T>(run:(api:ReturnType<typeof createInquiryInboxApiClient>)=>Promise<T>){const session=credential;try{if(!active||Date.parse(session.expiresAt)<=Date.now())throw new InquiryClientError('unauthenticated',401);return await run(createInquiryInboxApiClient(apiURL,()=>session.token));}catch(error){if(active&&error instanceof InquiryClientError&&error.status===401&&session.token===credential.token)onSessionRejected();throw error;}}
 onMount(()=>{const off=workspace.subscribe(next=>{state=next;});workspace.replaceScope(accountId,dealerID,{list:(cursor,signal)=>request(api=>api.list(dealerID,cursor,30,signal)),get:(id,signal)=>request(api=>api.get(dealerID,id,signal)),markRead:(id,revision,signal)=>request(api=>api.markRead(dealerID,id,revision,signal))});heading.focus();void workspace.refresh();return()=>{active=false;off();workspace.clear();};});
 async function select(id:string|null){await workspace.select(id);if(!active)return;await tick();if(id)detailHeading?.focus();else heading?.focus();}
</script>
<section aria-labelledby="inbox-heading">
 <button on:click={onBack}>{i18n.t('inbox.back')}</button>
 <header><h2 id="inbox-heading" tabindex="-1" bind:this={heading}>{i18n.t('inbox.heading')}</h2><button disabled={state.listBusy} on:click={()=>workspace.refresh()}>{i18n.t('inbox.refresh')}</button></header>
 {#if state.listIssue}<p role="alert">{i18n.t(denied(state.listIssue)?'inbox.denied':'inbox.failed')}</p><button on:click={()=>state.listOperation==='more'?workspace.loadMore():workspace.refresh()}>{i18n.t('inbox.retry')}</button>{/if}
 <div class="workspace" class:detail-open={!!state.selectedID||!!state.detailIssue}>
 <nav aria-label={i18n.t('inbox.heading')} aria-busy={state.listBusy}>
 {#if state.listBusy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 <ul>{#each state.items as item(item.id)}<li><button class:selected={state.selectedID===item.id} aria-pressed={state.selectedID===item.id} on:click={()=>select(item.id)}><span class="row"><strong>{item.contact.name}</strong><span class:unread={item.revision===1}>{i18n.t(item.revision===1?'inbox.unread':'inbox.read')}</span></span><span>{item.piano.title}</span><small>{date(item.createdAt)}</small></button></li>{/each}</ul>
 {#if !state.listBusy&&!state.listIssue&&!state.items.length}<p>{i18n.t('inbox.empty')}</p>{/if}
 {#if state.nextCursor}<button disabled={state.listBusy} on:click={()=>workspace.loadMore()}>{i18n.t('inbox.more')}</button>{/if}
 </nav>
 <article aria-busy={state.detailBusy||state.markBusy}>
 {#if state.selectedID||state.detailIssue}<button class="close" on:click={()=>select(null)}>{i18n.t('inbox.close')}</button><h3 tabindex="-1" bind:this={detailHeading}>{i18n.t('inbox.message')}</h3>{/if}
 {#if state.detailBusy}<p role="status">{i18n.t('common.loading')}</p>{/if}
 {#if state.detailIssue}<p role="alert">{i18n.t(denied(state.detailIssue)?'inbox.denied':state.selected?'inbox.markFailed':'inbox.failed')}</p>{#if state.selectedID}<button disabled={state.detailBusy||state.markBusy} on:click={()=>select(state.selectedID)}>{i18n.t('inbox.detailRefresh')}</button>{/if}{/if}
 {#if state.selected}{@const inquiry=state.selected}
 <p class="received">{i18n.t('inbox.received',{date:date(inquiry.createdAt)})}</p><h4>{inquiry.contact.name}</h4><p class="message">{inquiry.contact.message}</p>
 <section aria-label={i18n.t('inbox.contact')}><p>{i18n.t('inbox.preference',{preference:i18n.t(('inquiry.preference.'+inquiry.contact.preference) as MessageKey)})}</p><p><a href={'mailto:'+encodeURIComponent(inquiry.contact.email)}>{i18n.t('inbox.email')}</a><span class="value">{inquiry.contact.email}</span></p>{#if inquiry.contact.phone}<p><a href={'tel:'+inquiry.contact.phone.replace(/[^+0-9]/g,'')}>{i18n.t('inbox.phone')}</a><span class="value">{inquiry.contact.phone}</span></p>{/if}</section>
 <div class="read-state" aria-live="polite">{#if inquiry.readAt}<p>{i18n.t('inbox.readAt',{date:date(inquiry.readAt)})}</p>{:else}<button disabled={state.markBusy} on:click={()=>workspace.markRead()}>{i18n.t(state.markBusy?'inbox.marking':'inbox.markRead')}</button>{/if}</div>
 <section class="snapshot"><h4>{i18n.t('inbox.snapshot')}</h4><p class="note">{i18n.t('inbox.snapshotNote')}</p><h5>{inquiry.piano.title}</h5><p>{i18n.t('inventory.stock',{number:inquiry.piano.stock_number})}</p><p>{inquiry.piano.price?i18n.money(inquiry.piano.price.minor_units,inquiry.piano.price.currency):i18n.t('showroom.requestPrice')}</p><p class="message">{inquiry.piano.description}</p></section>
 {:else if !state.detailBusy&&!state.detailIssue}<p class="note">{i18n.t('inbox.select')}</p>{/if}
 </article></div>
</section>
<style>
 section{overflow-wrap:anywhere}header,.row{display:flex;align-items:center;justify-content:space-between;gap:1rem}header{flex-wrap:wrap;margin-bottom:1rem}button,a{min-height:44px}button{font:inherit;color:#183e32;background:white;border:1px solid #aabbb1;border-radius:.5rem;padding:.65rem .9rem;cursor:pointer}button:disabled{opacity:.55;cursor:default}:is(button,a,h2,h3):focus-visible{outline:3px solid #246aab;outline-offset:3px}h2{font-size:1.65rem}.workspace{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,1.7fr);gap:2rem}nav ul{list-style:none;padding:0;margin:0}nav li{margin-bottom:.6rem}nav li button{width:100%;display:grid;gap:.5rem;text-align:left}nav small,.received,.note{color:#52645e}nav button.selected{border:2px solid #245346;background:#eff5ef}.row span{font-size:.8rem}.unread{font-weight:700;color:#245346}article{min-width:0;padding-left:1.5rem;border-left:1px solid #d8e1da}h3,h4{font-size:1.1rem}h5{font-size:1.15rem;margin:1rem 0}.message{white-space:pre-wrap}.value{display:block;margin-top:.3rem}a{color:#245346}.snapshot{border-top:1px solid #d8e1da;margin-top:2rem;padding-top:1rem}.read-state{margin-top:1.5rem}.close{display:none}@media(max-width:750px){.workspace{grid-template-columns:1fr}.workspace article{display:none;padding:0;border:0}.detail-open nav{display:none}.detail-open article{display:block}.close{display:inline-block}}
</style>
