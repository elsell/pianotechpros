export const inventoryTextFields={title:240,make:160,model:160,serial:160,size:80,finish:200,location:200,description:10000,stock_number:80,private_notes:10000} as const;
export type InventoryTextField=keyof typeof inventoryTextFields;
export const inventoryForms=['','grand','full_size_upright','studio_upright','console','spinet'] as const;
export const inventoryConditions=['','new','used','restored','rebuilt','consignment','other'] as const;
export const inventoryCurrencies=['USD','CAD','EUR','GBP','AUD','NZD','JPY','CHF'] as const;
type Money={minor_units:number;currency:string};
export type InventoryWireAttributes=Partial<Record<Exclude<InventoryTextField,'stock_number'>,string>> & {stock_number:string;form?:string;condition?:string;featured?:boolean;player_system?:boolean;price_visible?:boolean;asking_price?:Money|null;acquisition_cost?:Money|null;manufactured?:{year:number;month:number;day:number}|null};
export type InventoryForm=Record<InventoryTextField|'form'|'condition'|'year'|'month'|'day'|'asking_amount'|'asking_currency'|'cost_amount'|'cost_currency',string> & {featured:boolean;player_system:boolean;price_visible:boolean;decimal:'.'|','};
export type InventoryFormField=Exclude<keyof InventoryForm,'decimal'>;
const extraText=['form','condition','year','month','day','asking_amount','asking_currency','cost_amount','cost_currency'] as const;
const toggles=['featured','player_system','price_visible'] as const;
const keys=new Set([...Object.keys(inventoryTextFields),...extraText,...toggles,'decimal']);
export function isInventoryForm(value:unknown):value is InventoryForm{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const f=value as Record<string,unknown>;
 if(Object.keys(f).length!==keys.size||Object.keys(f).some(k=>!keys.has(k))||!['.',','].includes(f.decimal as string))return false;
 for(const k of Object.keys(inventoryTextFields) as InventoryTextField[])if(typeof f[k]!=='string'||(f[k] as string).length>inventoryTextFields[k]*2)return false;
 for(const k of extraText)if(typeof f[k]!=='string'||(f[k] as string).length>80)return false;
 return toggles.every(k=>typeof f[k]==='boolean');
}
function amount(m:Money|null|undefined,decimal:'.'|','){
 if(!m)return '';
 const units=BigInt(m.minor_units);if(m.currency==='JPY')return units.toString();
 return `${units/100n}${decimal}${(units%100n).toString().padStart(2,'0')}`;
}
export function inventoryFormFromAttributes(a:InventoryWireAttributes,decimal:'.'|','):InventoryForm{
 const text=Object.fromEntries(Object.keys(inventoryTextFields).map(k=>[k,a[k as InventoryTextField]??''])) as Record<InventoryTextField,string>;
 return {...text,decimal,form:a.form??'',condition:a.condition??'',year:a.manufactured?String(a.manufactured.year):'',month:a.manufactured?.month?String(a.manufactured.month):'',day:a.manufactured?.day?String(a.manufactured.day):'',asking_amount:amount(a.asking_price,decimal),asking_currency:a.asking_price?.currency??'USD',cost_amount:amount(a.acquisition_cost,decimal),cost_currency:a.acquisition_cost?.currency??'USD',featured:!!a.featured,player_system:!!a.player_system,price_visible:!!a.price_visible};
}
function money(raw:string,currency:string,decimal:'.'|','):Money|null{
 if(!(inventoryCurrencies as readonly string[]).includes(currency))throw Error('inventory_invalid_form');
 const value=raw.trim();if(!value)return null;
 const digits=currency==='JPY'?0:2;
 const parts=value.split(decimal);
 if(parts.length>2||!/^\d+$/.test(parts[0]!)||parts[1]!==undefined&&(!digits||!/^\d+$/.test(parts[1])||parts[1].length>digits))throw Error('inventory_invalid_form');
 const units=BigInt(parts[0]!)*10n**BigInt(digits)+BigInt((parts[1]??'').padEnd(digits,'0')||'0');
 if(units>BigInt(Number.MAX_SAFE_INTEGER))throw Error('inventory_invalid_form');
 return {minor_units:Number(units),currency};
}
export function inventoryFormErrors(f:InventoryForm):InventoryFormField[]{
 const errors:InventoryFormField[]=[];
 for(const k of Object.keys(inventoryTextFields) as InventoryTextField[])if([...f[k].trim()].length>inventoryTextFields[k])errors.push(k);
 if(!f.stock_number.trim())errors.push('stock_number');
 if(!(inventoryForms as readonly string[]).includes(f.form))errors.push('form');
 if(!(inventoryConditions as readonly string[]).includes(f.condition))errors.push('condition');
 for(const [value,currency] of [['asking_amount','asking_currency'],['cost_amount','cost_currency']] as const){try{money(f[value],f[currency],f.decimal);}catch{errors.push(value);}}
 const y=f.year.trim(),m=f.month.trim(),d=f.day.trim();const year=Number(y),month=Number(m),day=Number(d);
 if(y&&!/^\d{1,4}$/.test(y)||y&&(year<1||year>9999)||!y&&(!!m||!!d))errors.push('year');
 if(m&&(!/^\d{1,2}$/.test(m)||month<1||month>12)||!m&&!!d)errors.push('month');
 const leap=year%4===0&&(year%100!==0||year%400===0);const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]??0;
 if(d&&(!/^\d{1,2}$/.test(d)||day<1||day>days))errors.push('day');
 return errors;
}
export function inventoryAttributesFromForm(f:InventoryForm):InventoryWireAttributes{
 if(!isInventoryForm(f)||inventoryFormErrors(f).length)throw Error('inventory_invalid_form');
 const text=Object.fromEntries(Object.keys(inventoryTextFields).map(k=>[k,f[k as InventoryTextField].trim()])) as Record<InventoryTextField,string>;
 return {...text,form:f.form as InventoryWireAttributes['form'],condition:f.condition as InventoryWireAttributes['condition'],featured:f.featured,player_system:f.player_system,price_visible:f.price_visible,manufactured:f.year.trim()?{year:Number(f.year),month:Number(f.month),day:Number(f.day)}:null,asking_price:money(f.asking_amount,f.asking_currency,f.decimal),acquisition_cost:money(f.cost_amount,f.cost_currency,f.decimal)};
}
