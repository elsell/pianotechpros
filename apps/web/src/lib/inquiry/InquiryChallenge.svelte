<script lang="ts">
 import {onMount} from 'svelte';
 import type {Translator} from '@pianotechpros/i18n';
 import {mountInquiryChallenge} from './turnstile';
 export let siteKey:string;export let i18n:Translator;export let onChange:(token:string)=>void;
 let element:HTMLDivElement;let failed=false;let instance:ReturnType<typeof mountInquiryChallenge>|undefined;
 function start(){instance?.dispose();onChange('');failed=false;instance=mountInquiryChallenge(element,siteKey,i18n.locale,(token,error)=>{failed=error;onChange(token);});}
 export function reset(){instance?.reset();}
 onMount(()=>{start();return ()=>{instance?.dispose();onChange('');};});
</script>
<div aria-label={i18n.t('inquiry.verification')}><div bind:this={element}></div>{#if failed}<p role="alert">{i18n.t('inquiry.verificationFailed')}</p><button type="button" on:click={start}>{i18n.t('inquiry.verificationRetry')}</button>{/if}</div>
<style>button{min-height:44px;padding:.6rem 1rem;color:#245346;background:transparent;border:1px solid #245346;border-radius:4px}p{color:#853a27}</style>
