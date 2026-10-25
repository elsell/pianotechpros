<script lang="ts">
 import SessionShell from '#lib/SessionShell.svelte';
 import CustomerProfile from '#lib/customer/CustomerProfile.svelte';
 import type {ClientRuntimeConfig} from '@pianotechpros/client-core';
 import type {SupportedLocale} from '@pianotechpros/i18n';
 export let data:{locale:SupportedLocale;config:ClientRuntimeConfig};
</script>
<SessionShell {data} let:accountId let:apiURL let:credential let:i18n let:onSessionRejected><CustomerProfile {accountId} {apiURL} {credential} {i18n} {onSessionRejected}/></SessionShell>
