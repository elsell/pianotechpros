<script lang="ts">
 import {createTranslator} from '@pianotechpros/i18n';
 import {sendNativeInquiryProof} from '../../lib/inquiry/native-bridge';
 import InquiryChallenge from '../../lib/inquiry/InquiryChallenge.svelte';
 import type {PageData} from './$types';
 export let data:PageData;
 $: i18n=createTranslator([data.locale]);

</script>
<svelte:head><title>{i18n.t('inquiry.verification')}</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<main><InquiryChallenge siteKey={data.siteKey} {i18n} onChange={sendNativeInquiryProof}/></main>
<style>:global(body){margin:0}main{padding:12px}</style>
