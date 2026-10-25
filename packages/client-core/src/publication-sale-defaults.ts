import {inventoryCurrencies,inventoryFormFromAttributes} from './inventory-form';
/** Private entry convenience only; confirmation still owns the sale command. */
export function publicationSaleDefaults(price:unknown,decimal:'.'|','):{amount:string;currency:string}{
 const blank={amount:'',currency:'USD'};
 if(!price||typeof price!=='object'||Array.isArray(price))return blank;
 const value=price as {minor_units:unknown;currency:unknown};
 if(typeof value.minor_units!=='number'||!Number.isSafeInteger(value.minor_units)||value.minor_units<0||typeof value.currency!=='string'||!(inventoryCurrencies as readonly string[]).includes(value.currency))return blank;
 const form=inventoryFormFromAttributes({stock_number:'',asking_price:{minor_units:value.minor_units,currency:value.currency}},decimal);
 return {amount:form.asking_amount,currency:form.asking_currency};
}
