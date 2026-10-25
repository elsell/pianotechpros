import {inventoryAttributesFromForm,inventoryTextFields,type InventoryForm,type InventoryWireAttributes} from './inventory-form';
import type {InventoryAttributionPolicy} from './inventory-editor';
export type InventoryAttributeField=keyof InventoryWireAttributes;
export const inventoryAttributeFields:readonly InventoryAttributeField[]=Object.freeze([...Object.keys(inventoryTextFields) as (keyof typeof inventoryTextFields)[],'form','condition','featured','player_system','price_visible','asking_price','acquisition_cost','manufactured']);
export function inventoryAttributionFields(fields:readonly string[]=[]):InventoryAttributeField[]{
 if(fields.length>18||new Set(fields).size!==fields.length||fields.some(f=>!inventoryAttributeFields.includes(f as InventoryAttributeField)))throw Error('invalid_inventory_attribution');
 return [...fields] as InventoryAttributeField[];
}
function group(field:InventoryAttributeField):readonly (keyof InventoryForm)[]{
 if(field==='asking_price')return ['asking_amount','asking_currency','decimal'];
 if(field==='acquisition_cost')return ['cost_amount','cost_currency','decimal'];
 if(field==='manufactured')return ['year','month','day'];
 return [field];
}
export const inventoryFormAttribution:InventoryAttributionPolicy<InventoryForm>={
 fields:inventoryAttributeFields,
 changed:(a,b)=>inventoryAttributeFields.filter(field=>group(field).some(key=>a[key]!==b[key])),
 saving:(a,b)=>{const before=inventoryAttributesFromForm(a),after=inventoryAttributesFromForm(b);return inventoryAttributeFields.filter(field=>JSON.stringify(before[field])!==JSON.stringify(after[field]));},
};
