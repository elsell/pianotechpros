import type {CustomerForm} from './customer-form';
export interface CustomerComparison {path:string;context:string;current:string|boolean|null;yours:string|boolean|null;currentLocationPosition?:number;yoursLocationPosition?:number}
/** Presentation data only: row identifiers remain in machine paths, never values. */
export function customerComparison(current:CustomerForm,yours:CustomerForm):CustomerComparison[]{
 const result:CustomerComparison[]=[];
 const add=(path:string,context:string,a:string|boolean|null,b:string|boolean|null)=>{if(a!==b)result.push({path,context,current:a,yours:b});};
 for(const field of ['name','isBusiness','businessName','email','phone'] as const)add(field,'',current[field],yours[field]);
 for(const kind of ['locations','pianos'] as const){
  const keys=new Set([...current[kind].map(row=>row.key),...yours[kind].map(row=>row.key)]);
  for(const key of keys){
   const a=current[kind].find(row=>row.key===key),b=yours[kind].find(row=>row.key===key);
   const context=kind==='locations'?(yours.locations.find(row=>row.key===key)?.label||current.locations.find(row=>row.key===key)?.label||''):(yours.pianos.find(row=>row.key===key)?.nickname||current.pianos.find(row=>row.key===key)?.nickname||'');
   const fields=kind==='locations'?['label','street1','street2','city','region','postalCode','timezone','notes']:['locationKey','nickname','form','make','model','serial','manufacturedYear','player','notes'];
   const value=(row:typeof a,form:CustomerForm,field:string):string|boolean|null=>{
    if(!row)return null;
    const raw=(row as unknown as Record<string,string|boolean>)[field];
    const location=form.locations.find(location=>location.key===raw);
    return field==='locationKey'?location?[location.label,location.street1,location.street2,location.city].filter(Boolean).join(' · '):'':raw;
   };
   for(const field of fields){
    if(field==='locationKey'){
     const old=current.pianos.find(p=>p.key===key),next=yours.pianos.find(p=>p.key===key);
     if(old?.locationKey!==next?.locationKey)result.push({path:`${kind}.${key}.${field}`,context,current:value(a,current,field),yours:value(b,yours,field),...(old?{currentLocationPosition:current.locations.findIndex(l=>l.key===old.locationKey)+1}:{}),...(next?{yoursLocationPosition:yours.locations.findIndex(l=>l.key===next.locationKey)+1}:{})});
    }else add(`${kind}.${key}.${field}`,context,value(a,current,field),value(b,yours,field));
   }
  }
 }
 return result;
}
