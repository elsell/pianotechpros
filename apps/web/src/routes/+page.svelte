<script lang="ts">
 import SessionShell from '#lib/SessionShell.svelte';
 import DealerDirectory from '#lib/dealer/DealerDirectory.svelte';
 import type {ClientRuntimeConfig} from '@pianotechpros/client-core';
 import type {SupportedLocale} from '@pianotechpros/i18n';
 export let data:{locale:SupportedLocale;config:ClientRuntimeConfig};
</script>
<SessionShell {data} let:accountId let:apiURL let:credential let:i18n let:onSessionRejected><p><a href="/customer" data-sveltekit-reload>{i18n.t('customer.heading')}</a></p><DealerDirectory {accountId} {apiURL} {credential} {i18n} {onSessionRejected}/></SessionShell>
