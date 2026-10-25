<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {createInventoryPhotoWorkspace,type InventoryFormWorkspace} from '@pianotechpros/client-core';
 import {createInventoryPhotoApiClient,InventoryClientError} from '@pianotechpros/api-client';
 import type {Translator,MessageKey} from '@pianotechpros/i18n';
 import type {SessionCredential} from '@pianotechpros/client-core';
 import {claimBrowserInventoryPhotos,protectPendingNavigation} from '../browser-events';
 import {openBrowserInventoryRecovery} from './recovery-storage';
 import {browserPhotoDigest,readBrowserPhoto} from './photo-media';
 import PhotoImage from './PhotoImage.svelte';
 export let otherBusy=false;export let onBusy:(value:boolean)=>void=()=>{};export let workspace:InventoryFormWorkspace;export let accountId:string;export let dealerID:string;export let apiURL:string;export let credential:SessionCredential;export let i18n:Translator;export let onSessionRejected:()=>void;
 let active=true;let selecting=false;let localError:MessageKey|null=null;let page=0;let preview:string|null=null;let removal:string|null=null;let altText='';let previewDialog:HTMLDialogElement;let removeDialog:HTMLDialogElement;
 async function request<T>(operation:(api:ReturnType<typeof createInventoryPhotoApiClient>)=>Promise<T>){const session=credential;try{return await operation(createInventoryPhotoApiClient(apiURL,()=>Date.parse(session.expiresAt)>Date.now()?session.token:null));}catch(error){if(active&&session.token===credential.token&&error instanceof InventoryClientError&&error.status===401)onSessionRejected();throw error;}}
 const capture='stagePhoto' in workspace?workspace as InventoryFormWorkspace & {stagePhoto(bytes:Uint8Array):Promise<string|null>;pendingPhoto():{id:string}|null;expiredPhoto():boolean;discardPhoto():Promise<void>}:null;
 const controller=createInventoryPhotoWorkspace({capture:capture?{stage:bytes=>capture.stagePhoto(bytes),pending:()=>capture.pendingPhoto(),expired:()=>capture.expiredPhoto(),discard:()=>capture.discardPhoto()}:undefined,userID:accountId,dealerID,active:()=>active&&!!workspace.snapshot().draft,recordID:()=>workspace.recordID(),
  ensureRecord:async()=>{if('ensureRecord' in workspace&&typeof workspace.ensureRecord==='function')return workspace.ensureRecord() as Promise<string|null>;return workspace.recordID()||null;},
  withMediaMutation:work=>workspace.withMediaMutation(work),now:Date.now,key:()=>crypto.randomUUID(),lease:id=>claimBrowserInventoryPhotos(accountId,dealerID,id),storage:()=>openBrowserInventoryRecovery(accountId),sha256:browserPhotoDigest,
  classify:error=>error instanceof InventoryClientError&&[401,403,404].includes(error.status)?'denied':error instanceof InventoryClientError&&error.code==='conflict'?'conflict':error instanceof InventoryClientError&&[400,413,422].includes(error.status)?'rejected':'uncertain',
  list:id=>request(api=>api.list(dealerID,id)),upload:(id,bytes,key,revision)=>request(api=>api.upload(dealerID,id,bytes,key,revision)),
  reorder:(id,ids,revision)=>request(api=>api.reorder(dealerID,id,ids,revision)),describe:(id,photoID,alt,revision)=>request(api=>api.describe(dealerID,id,photoID,alt,revision)),remove:(id,photoID,revision)=>request(api=>api.remove(dealerID,id,photoID,revision)),
 });
 let state=controller.snapshot();let unsubscribe=()=>{};
 $: ownBusy=selecting||state.busy;
 $: busy=ownBusy||otherBusy;
 $: onBusy(ownBusy);
 $: if(page>0&&page*6>=state.photos.length)page=Math.max(0,Math.ceil(state.photos.length/6)-1);
 $: current=state.photos.find(photo=>photo.id===preview);
 async function run(operation:()=>Promise<unknown>){if(otherBusy)return;localError=null;try{await operation();}catch{/* Controller exposes a fixed localized state. */}}
 async function choose(event:Event){const input=event.currentTarget as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file||busy)return;selecting=true;localError=null;try{const bytes=await readBrowserPhoto(file);if(active)await controller.add(bytes);}catch(error){if(active)localError=error instanceof Error&&error.message==='photo_size'?'inventory.photos.size':error instanceof Error&&error.message==='photo_format'?'inventory.photos.format':'inventory.photos.failed';}finally{if(active)selecting=false;}}
 async function show(photoID:string){preview=photoID;altText=state.photos.find(p=>p.id===photoID)?.altText??'';await tick();previewDialog.showModal();}
 async function confirmRemove(photoID:string){removal=photoID;await tick();removeDialog.showModal();}
 async function remove(){const id=removal;if(!id)return;removeDialog.close();removal=null;await run(()=>controller.remove(id));}
 async function saveAlt(){if(!preview)return;await run(()=>controller.describe(preview!,altText));if(!controller.snapshot().failure&&preview)altText=controller.snapshot().photos.find(p=>p.id===preview)?.altText??altText;}
 const phaseKey=(phase:string):MessageKey=>phase==='conflict'?'inventory.photos.uploadConflict':phase==='acknowledged'||phase==='removing'?'inventory.photos.cleanup':`inventory.photos.${phase}` as MessageKey;
 onMount(()=>{const unprotect=protectPendingNavigation(()=>busy);unsubscribe=controller.subscribe(value=>{state=value;});void run(()=>controller.refresh());return()=>{active=false;unprotect();unsubscribe();onBusy(false);void controller.dispose();};});
</script>
<section aria-labelledby="photos-heading" class="photos">
 <h3 id="photos-heading">{i18n.t('inventory.photos.heading')}</h3><p class="hint">{i18n.t('inventory.photos.hint')}</p>
 <div class="sources"><label class="source">{i18n.t('inventory.photos.camera')}<input type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy||state.denied} onchange={choose} /></label><label class="source">{i18n.t('inventory.photos.library')}<input type="file" accept="image/jpeg,image/png" disabled={busy||state.denied} onchange={choose} /></label></div>
 {#if busy}<p role="status">{i18n.t('inventory.photos.busy')}</p>{/if}
 {#if state.denied}<p role="alert">{i18n.t('inventory.denied')}</p>{:else if localError||state.failure}<p role="alert">{i18n.t(localError??(state.failure==='conflict'?'inventory.photos.conflict':'inventory.photos.failed'))}</p>{/if}
 {#if state.expiredSelections}<p role="status">{i18n.t('inventory.photos.expired')}</p>{/if}
 {#if state.uncertainExpirations}<p role="status">{i18n.t('inventory.photos.expiredUncertain')}</p>{/if}
 {#if !state.photos.length&&!busy&&!state.denied}<p class="empty">{i18n.t('inventory.photos.empty')}</p>{/if}
 <ol class="gallery" start={page*6+1}>{#each state.photos.slice(page*6,page*6+6) as photo,index (photo.id)}
  {@const position=page*6+index}
  <li><button class="thumbnail" type="button" aria-label={i18n.t('inventory.photos.preview',{number:i18n.number(position+1)})} onclick={()=>show(photo.id)}><PhotoImage read={()=>request(api=>api.image(dealerID,workspace.recordID(),photo.id))} alt={photo.altText} {i18n} /></button>
   <div class="photo-title">{i18n.t('inventory.photos.number',{number:i18n.number(position+1)})}{#if position===0}<span class="cover">{i18n.t('inventory.photos.cover')}</span>{/if}</div>
   <div class="actions"><button disabled={busy||position===0} onclick={()=>run(()=>controller.cover(photo.id))}>{i18n.t('inventory.photos.makeCover')}</button><button disabled={busy||position===0} onclick={()=>run(()=>controller.move(photo.id,-1))}>{i18n.t('inventory.photos.earlier')}</button><button disabled={busy||position===state.photos.length-1} onclick={()=>run(()=>controller.move(photo.id,1))}>{i18n.t('inventory.photos.later')}</button><button disabled={busy} onclick={()=>confirmRemove(photo.id)}>{i18n.t('inventory.photos.remove')}</button></div>
  </li>
 {/each}</ol>
 {#if state.photos.length>6}<nav aria-label={i18n.t('inventory.photos.heading')}><button disabled={page===0} onclick={()=>page--}>{i18n.t('inventory.photos.previous')}</button><button disabled={(page+1)*6>=state.photos.length} onclick={()=>page++}>{i18n.t('inventory.photos.next')}</button></nav>{/if}
 <button disabled={busy} onclick={()=>run(()=>controller.refresh())}>{i18n.t('inventory.photos.refresh')}</button>
 {#if state.capturePending}<section><h4>{i18n.t('inventory.photos.pending')}</h4><p>{i18n.t('inventory.photos.capturePending')}</p><button disabled={busy} onclick={()=>run(()=>controller.retryCapture())}>{i18n.t('inventory.photos.retry')}</button><button disabled={busy} onclick={()=>run(()=>controller.discardCapture())}>{i18n.t('inventory.photos.discard')}</button></section>{/if}
 {#if state.entries.length}<section aria-labelledby="pending-photos"><h4 id="pending-photos">{i18n.t('inventory.photos.pending')}</h4><ol class="pending">{#each state.entries as entry (entry.id)}<li><p>{i18n.t(entry.state==='removing'&&!entry.photoID?'inventory.photos.localCleanup':phaseKey(entry.state))}</p>
  {#if entry.state==='conflict'}<button disabled={busy} onclick={()=>run(()=>controller.rebase(entry.id))}>{i18n.t('inventory.photos.rebase')}</button>{:else if entry.state!=='rejected'}<button disabled={busy} onclick={()=>run(()=>controller.retry(entry.id))}>{i18n.t(entry.state==='acknowledged'||entry.state==='removing'?'inventory.photos.cleanupAction':'inventory.photos.retry')}</button>{/if}
  {#if ['reserved','ready','conflict','rejected'].includes(entry.state)}<button disabled={busy} onclick={()=>run(()=>controller.discard(entry.id))}>{i18n.t('inventory.photos.discard')}</button>{/if}
 </li>{/each}</ol></section>{/if}
</section>
<dialog bind:this={previewDialog} onclose={()=>preview=null} aria-label={i18n.t('inventory.photos.heading')}>
 {#if current}<div class="preview">{#key current.id}<PhotoImage read={()=>request(api=>api.image(dealerID,workspace.recordID(),current!.id))} alt={current.altText} {i18n} />{/key}</div>
  <form onsubmit={event=>{event.preventDefault();void saveAlt();}}><label for="photo-alt">{i18n.t('inventory.photos.alt')}</label><p id="photo-alt-hint" class="hint">{i18n.t('inventory.photos.altHint')}</p><textarea id="photo-alt" aria-describedby="photo-alt-hint" rows="3" bind:value={altText} maxlength="480"></textarea><button disabled={busy||[...altText.trim()].length>240}>{i18n.t('inventory.photos.saveAlt')}</button></form>
  {#if state.failure}<p role="alert">{i18n.t(state.failure==='conflict'?'inventory.photos.conflict':'inventory.photos.failed')}</p>{/if}
 {/if}
 <button onclick={()=>previewDialog.close()}>{i18n.t('inventory.photos.close')}</button>
</dialog>
<dialog bind:this={removeDialog} onclose={()=>removal=null} aria-labelledby="remove-photo-title"><h3 id="remove-photo-title">{i18n.t('inventory.photos.removeTitle')}</h3><p>{i18n.t('inventory.photos.removeHint')}</p><button onclick={()=>removeDialog.close()}>{i18n.t('inventory.photos.cancel')}</button><button disabled={busy} onclick={remove}>{i18n.t('inventory.photos.remove')}</button></dialog>
<style>
 .photos{margin:1.5rem 0;padding:1.25rem;background:#f7f9f6;border:1px solid #cbd6cf;border-radius:1rem}h3{margin:0;font-size:1.25rem}.hint{color:#52645e;line-height:1.5}.sources,.actions{display:flex;flex-wrap:wrap;gap:.5rem}.source,button,textarea{font:inherit;box-sizing:border-box;border:1px solid #9caf9f;border-radius:.5rem;background:white;color:#183e32;min-height:44px;padding:.65rem}.source{position:relative;cursor:pointer}.source input{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.source:has(input:disabled){opacity:.55;cursor:default}.source:focus-within,button:focus-visible,textarea:focus-visible{outline:3px solid #246aab;outline-offset:3px}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}.empty{padding:2rem 1rem;text-align:center;color:#52645e}.gallery{list-style:none;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.gallery li{min-width:0;background:white;border:1px solid #cbd6cf;border-radius:.75rem;padding:.6rem}.thumbnail{padding:0;width:100%;height:180px;overflow:hidden;border:0}.photo-title{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:.7rem 0;font-weight:600}.cover{font-size:.8rem;padding:.2rem .5rem;border-radius:1rem;background:#dbeadd}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.actions button{font-size:.875rem;overflow-wrap:normal}.pending{padding-left:1.4rem}.pending li{padding:.5rem 0}.pending button,nav button,dialog button{margin:.3rem .5rem .3rem 0}dialog{max-width:min(680px,90vw);max-height:90vh;overflow:auto;border:1px solid #9caf9f;border-radius:1rem;padding:1.25rem;color:#183e32}dialog::backdrop{background:#10251bcc}.preview{height:min(50vh,400px);margin-bottom:1rem}textarea{display:block;width:100%;resize:vertical;margin:.75rem 0}label{font-weight:600}@media(max-width:560px){.photos{padding:1rem .75rem}.gallery{grid-template-columns:1fr}.thumbnail{height:220px}}
</style>
