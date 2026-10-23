import {inventoryForms,inventoryCurrencies,inventoryMoneyFromInput} from './inventory-form';
export type ShowroomFilterFields=Partial<Record<'search'|'form'|'availability'|'currency'|'minimum'|'maximum'|'cursor',string>>;
export function showroomFilters(fields:ShowroomFilterFields,decimal:'.'|','){
 const fail=()=>{throw new Error('invalid_showroom_filters');};
 const result:{limit:number;search?:string;form?:'grand'|'full_size_upright'|'studio_upright'|'console'|'spinet';availability?:'all'|'available'|'reserved'|'sold';currency?:string;minPrice?:number;maxPrice?:number;cursor?:string}={limit:12};
 if(fields.search){if([...fields.search.trim()].length>120||/[\p{Cc}\p{Surrogate}]/u.test(fields.search))fail();if(fields.search.trim())result.search=fields.search.trim();}
 if(fields.form){if(!(inventoryForms as readonly string[]).includes(fields.form))fail();result.form=fields.form as typeof result.form;}
 if(fields.availability){if(!['all','available','reserved','sold'].includes(fields.availability))fail();result.availability=fields.availability as typeof result.availability;}
 if(fields.currency){if(!(inventoryCurrencies as readonly string[]).includes(fields.currency))fail();result.currency=fields.currency;}
 if(fields.minimum||fields.maximum){if(!fields.currency)fail();const min=inventoryMoneyFromInput(fields.minimum??'',fields.currency!,decimal);const max=inventoryMoneyFromInput(fields.maximum??'',fields.currency!,decimal);if(min)result.minPrice=min.minor_units;if(max)result.maxPrice=max.minor_units;if(min&&max&&min.minor_units>max.minor_units)fail();}
 if(fields.cursor){if(fields.cursor.length>4096||!/^[A-Za-z0-9_-]+$/.test(fields.cursor))fail();result.cursor=fields.cursor;}
 return result;
}
