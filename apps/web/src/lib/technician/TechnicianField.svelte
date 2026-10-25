<script lang="ts">
 import {technicianFieldLabel,type Translator} from '@pianotechpros/i18n';
 export let path:string;export let value:string;export let required=false;export let max=200;export let invalid=false;export let i18n:Translator;export let change:(value:string)=>void;
 const leaf=()=>path.split('.').at(-1);
</script>
<div class="field">
 <label for={path}>{i18n.t(technicianFieldLabel(path))} <span>({i18n.t(required?'technician.required':'technician.optional')})</span></label>
 {#if leaf()==='biography'}<textarea id={path} name={path} rows="4" {value} maxlength={max*2} aria-invalid={invalid} aria-describedby={invalid?path+'-error':undefined} oninput={e=>change(e.currentTarget.value)}></textarea>
 {:else}<input id={path} name={path} type={leaf()==='email'?'email':leaf()==='phone'?'tel':'text'} inputmode={['radiusMiles','drivingMinutes'].includes(leaf()??'')?'numeric':undefined} {value} maxlength={max*2} aria-required={required} aria-invalid={invalid} aria-describedby={invalid?path+'-error':undefined} oninput={e=>change(e.currentTarget.value)} />{/if}
 {#if invalid}<p id={path+'-error'}>{i18n.t('technician.fieldError')}</p>{/if}
</div>
<style>
.field{margin:1rem 0}label{display:block;margin-bottom:.4rem;font-weight:550}label span{font-weight:400;color:#52645e;font-size:.9rem}input,textarea{font:inherit;width:100%;min-height:44px;padding:.7rem;box-sizing:border-box;border:1px solid #8c9f94;border-radius:.5rem;background:white;color:#183e32}textarea{resize:vertical}input:focus-visible,textarea:focus-visible{outline:3px solid #246aab;outline-offset:2px}[aria-invalid=true]{border:2px solid #a52828}p{color:#8a2525;margin:.35rem 0}
</style>
