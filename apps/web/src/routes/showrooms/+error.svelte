<script lang="ts">
 import {page} from '$app/state';
 import {createTranslator} from '@pianotechpros/i18n';
 $: i18n=createTranslator([page.data.locale]);
</script>
<svelte:head><title>{i18n.t('showroom.title')}</title></svelte:head>
<main><h1>{i18n.t('showroom.title')}</h1><p>{page.error?.message}</p><a href="/">{i18n.t('showroom.home')}</a></main>
<style>main{max-width:42rem;margin:5rem auto;padding:2rem;font-family:system-ui}a{color:#245346}</style>
