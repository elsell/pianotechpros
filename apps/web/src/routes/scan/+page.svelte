<script lang="ts">
 import {onMount} from 'svelte';
 import {parseInventoryScanLink,type ClientRuntimeConfig} from '@pianotechpros/client-core';
 import {createTranslator,type SupportedLocale} from '@pianotechpros/i18n';
 import SessionShell from '#lib/SessionShell.svelte';
 import InventoryScanView from '#lib/inventory/InventoryScanView.svelte';
 import {browserScanContinuation} from '#lib/scan-continuation.js';
 import {consumeInventoryScanLocation,observeInventoryScanLocation} from '#lib/browser-events.js';
 export let data:{locale:SupportedLocale;config:ClientRuntimeConfig};
 let entry=0;let ready=false;let validEntry=false;let link:string|null=null;
 $: i18n=createTranslator([data.locale]);
 function cancel(){browserScanContinuation().clear();link=null;window.location.replace('/');}
 function capture(){entry++;try{const incoming=consumeInventoryScanLocation();const continuation=browserScanContinuation();link=incoming??continuation.take();continuation.clear();if(link)parseInventoryScanLink(window.location.origin,link);}catch{browserScanContinuation().clear();link=null;}finally{ready=true;validEntry=link!==null;}}
 onMount(()=>{capture();return observeInventoryScanLocation(capture);});
 function discard(){browserScanContinuation().clear();link=null;}

 function continueSignIn(){return link!==null&&browserScanContinuation().save(link);}
</script>
<svelte:head><meta name="robots" content="noindex,nofollow"/></svelte:head>
{#if ready}
 {#if validEntry}<SessionShell {data} beforeSignIn={continueSignIn} onSignInFailure={()=>browserScanContinuation().clear()} onSignOut={discard} onSignedOut={cancel} let:accountId let:apiURL let:credential let:i18n let:onSessionRejected>{#if link}{#key entry}<InventoryScanView {link} {accountId} {apiURL} {credential} {i18n} {onSessionRejected}/>{/key}{/if}</SessionShell>
 {:else}<main class="invalid-scan"><h1>{i18n.t('scan.view.title')}</h1><p role="alert">{i18n.t('scan.view.invalid')}</p></main>{/if}
 <div class="scan-exit"><button onclick={cancel}>{i18n.t('scan.view.cancel')}</button></div>
{:else}<p>{i18n.t('common.loading')}</p>{/if}

<style>.invalid-scan,.scan-exit{font:17px system-ui;max-width:38rem;margin:2rem auto;padding:0 1.25rem}.scan-exit button{font:inherit;min-height:44px;padding:.65rem 1rem;border:1px solid #789486;border-radius:.5rem;background:white;color:#183e32}.scan-exit button:focus-visible{outline:3px solid #246aab;outline-offset:3px}</style>
