<script lang="ts">
 import type {ShowroomMetadata} from '@pianotechpros/client-core';
 export let metadata:ShowroomMetadata|null;
 // jsonLD comes only from the public metadata serializer, which escapes HTML delimiters.
 $: jsonScript=metadata?'<script type="application/ld+json" data-public-discovery>'+metadata.jsonLD+'</'+'script>':'';
</script>
<svelte:head>{#if metadata}
 <link rel="canonical" href={metadata.canonical} />
 <meta property="og:type" content="website" />
 <meta property="og:url" content={metadata.canonical} />
 <meta property="og:title" content={metadata.title} />
 <meta property="og:description" content={metadata.description} />
 {#if metadata.image}<meta property="og:image" content={metadata.image} />{/if}
 <meta name="twitter:card" content={metadata.image?'summary_large_image':'summary'} />
 {@html jsonScript}
{/if}</svelte:head>
