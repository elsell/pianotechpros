<script lang="ts">
 import {onDestroy,onMount,tick} from 'svelte';
 import {createPublicInquiryApiClient,InquiryClientError} from '@pianotechpros/api-client';
 import {createInquiryComposer,type InquiryChallengeConfig,type InquiryContactField} from '@pianotechpros/client-core';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import InquiryChallenge from './InquiryChallenge.svelte';
 export let apiURL:string;export let slug:string;export let pianoID:string;export let config:InquiryChallengeConfig;export let i18n:Translator;
 let active=true;let ready=false;let token='';let honeypot='';let challenge:InquiryChallenge;let feedback:HTMLDivElement;
 const api=createPublicInquiryApiClient(apiURL);
 const composer=createInquiryComposer({submit:(body,signal)=>api.submit(slug,pianoID,{...body,preference:body.preference as 'email'|'phone'|'either'},signal),classify:(error)=>error instanceof InquiryClientError&&error.code!=='unauthenticated'&&error.code!=='conflict'?error.code:'unavailable',changed:()=>{state=composer.state();}});
 let state=composer.state();
 onMount(()=>{ready=true;});onDestroy(()=>{active=false;composer.dispose();});
 function edit(field:InquiryContactField,event:Event){composer.set(field,(event.currentTarget as HTMLInputElement).value);}
 async function send(){if(!ready||state.busy||config.policy==='unavailable'||config.policy==='enabled'&&!token)return;const proof=token;await composer.submit(proof,honeypot);if(!active)return;token='';challenge?.reset();if(state.delivered)honeypot='';await tick();feedback?.focus();}
</script>
<section class="inquiry" aria-labelledby="inquiry-heading">
 <h2 id="inquiry-heading">{i18n.t('inquiry.heading')}</h2>
 {#if config.policy==='unavailable'}<p>{i18n.t('inquiry.unavailable')}</p>
 {:else}
 <div bind:this={feedback} tabindex="-1" class="feedback" role="status" aria-live="polite">
 {#if state.delivered}<h3>{i18n.t('inquiry.sent')}</h3>{:else if state.errors.length}<p>{i18n.t('inquiry.validation')}</p><ul>{#each state.errors as field}<li><a href={'#inquiry-'+field}>{i18n.t(('inquiry.invalid.'+field) as MessageKey)}</a></li>{/each}</ul>{:else if state.issue}<p>{i18n.t(('inquiry.error.'+state.issue) as MessageKey)}</p>{/if}
 </div>
 {#if !state.delivered}<p>{i18n.t('inquiry.intro')}</p><noscript><p>{i18n.t('inquiry.javascript')}</p></noscript>
 <form on:submit|preventDefault={send} novalidate aria-busy={state.busy}>
 <fieldset disabled={!ready||state.busy}>
 <div class="pair">{#each (['name','email'] as const) as field}<div><label for={'inquiry-'+field}>{i18n.t(('inquiry.'+field) as MessageKey)}</label><input id={'inquiry-'+field} name={field} type={field==='email'?'email':'text'} autocomplete={field} required value={state.fields[field as 'name'|'email']} on:input={event=>edit(field as InquiryContactField,event)} aria-invalid={state.errors.includes(field as InquiryContactField)} aria-describedby={state.errors.includes(field as InquiryContactField)?'inquiry-error-'+field:undefined} />{#if state.errors.includes(field as InquiryContactField)}<p class="error" id={'inquiry-error-'+field}>{i18n.t(('inquiry.invalid.'+field) as MessageKey)}</p>{/if}</div>{/each}</div>
 <div class="pair"><div><label for="inquiry-phone">{i18n.t('inquiry.phone')}</label><input id="inquiry-phone" name="phone" type="tel" autocomplete="tel" value={state.fields.phone} on:input={event=>edit('phone',event)} aria-invalid={state.errors.includes('phone')} aria-describedby={state.errors.includes('phone')?'inquiry-error-phone':undefined} />{#if state.errors.includes('phone')}<p class="error" id="inquiry-error-phone">{i18n.t('inquiry.invalid.phone')}</p>{/if}</div><div><label for="inquiry-preference">{i18n.t('inquiry.preference')}</label><select id="inquiry-preference" value={state.fields.preference} on:change={event=>edit('preference',event)}>{#each ['email','phone','either'] as preference}<option value={preference}>{i18n.t(('inquiry.preference.'+preference) as MessageKey)}</option>{/each}</select></div></div>
 <label for="inquiry-message">{i18n.t('inquiry.message')}</label><textarea id="inquiry-message" name="message" rows="5" required value={state.fields.message} on:input={event=>edit('message',event)} aria-invalid={state.errors.includes('message')} aria-describedby={state.errors.includes('message')?'inquiry-error-message':undefined}></textarea>{#if state.errors.includes('message')}<p class="error" id="inquiry-error-message">{i18n.t('inquiry.invalid.message')}</p>{/if}
 <div class="honeypot" aria-hidden="true"><label for="inquiry-website">{i18n.t('inquiry.honeypot')}</label><input id="inquiry-website" name="website" autocomplete="off" tabindex="-1" bind:value={honeypot} /></div>
 </fieldset>
 {#if config.policy==='enabled'}<InquiryChallenge bind:this={challenge} siteKey={config.siteKey} {i18n} onChange={value=>{token=value;}} />{/if}
 <button class="send" type="submit" disabled={!ready||state.busy||config.policy==='enabled'&&!token}>{i18n.t(state.busy?'inquiry.sending':'inquiry.send')}</button>
 </form>{/if}{/if}
</section>
<style>
 .inquiry{max-width:720px;margin:3rem auto 0;padding:2rem;border:1px solid #d8ddd3;border-radius:6px;background:#fffef9}h2{font:400 1.8rem Georgia,serif;margin-top:0}h3{font-size:1.2rem;color:#245346}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}fieldset{border:0;padding:0;margin:0;min-width:0}label{display:block;font-weight:600;margin:.8rem 0 .35rem}input,select,textarea{font:inherit;box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #85988b;border-radius:4px;background:white;color:#242d28}textarea{resize:vertical;min-height:8rem}input[aria-invalid=true],textarea[aria-invalid=true]{border-color:#a43224}.error{color:#853a27;font-size:.9rem;margin:.4rem 0}.feedback:empty{display:none}.feedback:focus,textarea:focus-visible{outline:3px solid #ab6525;outline-offset:4px}.feedback a{color:#853a27}.honeypot{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.send{min-height:48px;padding:.8rem 1.5rem;margin-top:1rem;background:#245346;border:1px solid #245346;color:white;border-radius:4px;font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.55;cursor:default}@media(max-width:650px){.inquiry{padding:1.2rem}.pair{grid-template-columns:1fr;gap:0}.send{width:100%}}
</style>
