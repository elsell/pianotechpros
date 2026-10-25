import {inventoryFormFromAttributes,inventoryFormErrors,isInventoryForm,inventoryTextFields,inventoryCurrencies,type InventoryForm,type InventoryWireAttributes} from './inventory-form';

export type InventoryVoiceField=keyof typeof inventoryTextFields|'form'|'condition'|'featured'|'player_system'|'price_visible'|'asking_price'|'acquisition_cost'|'manufactured';
export type InventoryVoiceValue={text?:string;boolean?:boolean;money?:{minor_units:number;currency:string};date?:{year:number;month:number;day:number}};
export type InventoryVoiceCandidate={field:InventoryVoiceField;value:InventoryVoiceValue;confidence:'high'|'uncertain';evidence:string};
export type InventoryVoiceProposal={revision:number;transcript:string;candidates:InventoryVoiceCandidate[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.trim()===v&&[...v].length<=max&&!/\p{Surrogate}/u.test(v);
const toggles=['featured','player_system','price_visible'];
const prices=['asking_price','acquisition_cost'];
function kind(field:string):keyof InventoryVoiceValue|null{
 if(Object.hasOwn(inventoryTextFields,field)||field==='form'||field==='condition')return 'text';
 if(toggles.includes(field))return 'boolean';if(prices.includes(field))return 'money';if(field==='manufactured')return 'date';return null;
}
function candidateAttributes(c:InventoryVoiceCandidate):InventoryWireAttributes{
 const k=kind(c.field)!;return {stock_number:'voice-validation', [c.field]:c.value[k]};
}
export function validInventoryVoiceProposal(v:unknown):v is InventoryVoiceProposal{
 if(!object(v)||!exact(v,['revision','transcript','candidates'])||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||!text(v.transcript,16000)||!Array.isArray(v.candidates)||v.candidates.length>18)return false;
 const seen=new Set<string>();
 for(const c of v.candidates){
  if(!object(c)||!exact(c,['field','value','confidence','evidence'])||typeof c.field!=='string'||seen.has(c.field)||!object(c.value)||!text(c.evidence,600)||!v.transcript.includes(c.evidence)||(c.confidence!=='high'&&c.confidence!=='uncertain'))return false;
  seen.add(c.field);const k=kind(c.field);if(!k||!exact(c.value,[k]))return false;const value=c.value[k];
  if(k==='text'&&!text(value,(inventoryTextFields as Record<string,number>)[c.field]??80))return false;
  if(k==='boolean'&&typeof value!=='boolean')return false;
  if(k==='money'&&(!object(value)||!exact(value,['minor_units','currency'])||!Number.isSafeInteger(value.minor_units)||Number(value.minor_units)<0||typeof value.currency!=='string'||!(inventoryCurrencies as readonly string[]).includes(value.currency)))return false;
  if(k==='date'&&(!object(value)||!exact(value,['year','month','day'])||!['year','month','day'].every(key=>Number.isSafeInteger(value[key]))||Number(value.year)<1||Number(value.year)>9999||Number(value.month)<0||Number(value.month)>12||Number(value.day)<0||Number(value.day)>31))return false;
  // Existing form validation is the shared presentation policy for supported
  // enum values, currencies and partial dates. Validate only this suggestion.
  try {if(inventoryFormErrors(inventoryFormFromAttributes(candidateAttributes(c as InventoryVoiceCandidate),'.')).length)return false;}catch{return false;}
 }
 return true;
}
function group(field:InventoryVoiceField):(keyof InventoryForm)[]{
 if(field==='asking_price')return ['asking_amount','asking_currency'];
 if(field==='acquisition_cost')return ['cost_amount','cost_currency'];
 if(field==='manufactured')return ['year','month','day'];return [field];
}
function equalGroup(a:InventoryForm,b:InventoryForm,field:InventoryVoiceField){return (!prices.includes(field)||a.decimal===b.decimal)&&group(field).every(k=>a[k]===b[k]);}
function copyGroup(target:InventoryForm,source:InventoryForm,field:InventoryVoiceField){for(const key of group(field))Object.assign(target,{[key]:source[key]});}
export type InventoryVoiceChange={before():InventoryForm;after():InventoryForm;fields():InventoryVoiceField[];undo(current:InventoryForm):{form:InventoryForm;conflicts:InventoryVoiceField[]}};
export function applyInventoryVoiceProposal(proposal:unknown,reviewed:InventoryForm,current:InventoryForm,selection:readonly string[]):{change:InventoryVoiceChange|null;conflicts:InventoryVoiceField[]}{
 if(!validInventoryVoiceProposal(proposal)||!isInventoryForm(reviewed)||!isInventoryForm(current)||!Array.isArray(selection)||new Set(selection).size!==selection.length)throw Error('invalid_voice_proposal');
 const chosen:InventoryVoiceCandidate[]=[];
 for(const field of selection){const c=proposal.candidates.find(c=>c.field===field);if(!c)throw Error('invalid_voice_selection');chosen.push(c);}
 const conflicts=chosen.filter(c=>!equalGroup(reviewed,current,c.field)).map(c=>c.field);
 if(conflicts.length)return {change:null,conflicts};
 const before={...current},after={...current};const changed:InventoryVoiceField[]=[];
 for(const c of chosen){
  const source=inventoryFormFromAttributes(candidateAttributes(c),current.decimal);
  if(!equalGroup(after,source,c.field)){copyGroup(after,source,c.field);changed.push(c.field);}
 }
 const change:InventoryVoiceChange=Object.freeze({
  before:()=>({...before}),after:()=>({...after}),fields:()=>[...changed],
  undo(input:InventoryForm){if(!isInventoryForm(input))throw Error('invalid_voice_form');const result={...input},conflicts:InventoryVoiceField[]=[];for(const field of changed){if(equalGroup(input,after,field))copyGroup(result,before,field);else conflicts.push(field);}return {form:result,conflicts};},
 });
 return {change,conflicts:[]};
}
