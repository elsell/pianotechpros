<script lang="ts">
 import {onMount} from 'svelte';
 import type {Translator} from '@pianotechpros/i18n';
 import {privatePhotoURL} from './photo-media';
 export let read:()=>Promise<Uint8Array>;export let alt:string;export let i18n:Translator;
 let active=true;let source:ReturnType<typeof privatePhotoURL>|null=null;let loading=true;let failed=false;
 async function load(){loading=true;failed=false;try{const bytes=await read();if(!active)return;source?.dispose();source=privatePhotoURL(bytes);}catch{if(active){source?.dispose();source=null;failed=true;}}finally{if(active)loading=false;}}
 onMount(()=>{void load();return()=>{active=false;source?.dispose();source=null;};});
</script>
{#if source}<img src={source.url} {alt} />{:else if loading}<span class="placeholder" role="status">{i18n.t('common.loading')}</span>{:else if failed}<span class="placeholder">{i18n.t('inventory.photos.imageFailed')}</span>{/if}
<style>img{display:block;width:100%;height:100%;max-height:65vh;object-fit:contain;background:#edf1ed;border-radius:.6rem}.placeholder{display:grid;place-items:center;min-height:100px;padding:1rem;color:#52645e}</style>
