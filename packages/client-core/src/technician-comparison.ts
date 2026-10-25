import type {TechnicianForm} from './technician-form';
export type TechnicianComparisonValue=string|boolean|number|string[]|null;
export interface TechnicianDifference {path:string;weekday?:number;current:TechnicianComparisonValue;yours:TechnicianComparisonValue}
export function technicianComparison(current:TechnicianForm,yours:TechnicianForm):TechnicianDifference[]{
 const rows:TechnicianDifference[]=[];
 const add=(path:string,a:TechnicianComparisonValue,b:TechnicianComparisonValue,weekday?:number)=>{if(JSON.stringify(a)!==JSON.stringify(b))rows.push({path,current:a,yours:b,weekday});};
 for(const key of ['name','businessName','email','phone','biography','searchable','acceptsRequestsWithoutAvailability','radiusMiles','drivingMinutes'] as const)add(key,current[key],yours[key]);
 for(const key of ['label','street1','street2','city','region','postalCode','timezone'] as const)add('origin.'+key,current.origin[key],yours.origin[key]);
 for(const key of ['services','forms'] as const)add(key,[...current[key]].sort(),[...yours[key]].sort());
 const keys=new Set([...current.availability,...yours.availability].map(r=>r.key));
 for(const key of keys){const a=current.availability.find(r=>r.key===key),b=yours.availability.find(r=>r.key===key);for(const field of ['weekday','kind','start','end','timezone','effectiveStart','effectiveEnd'] as const)add('availability.'+key+'.'+field,a?.[field]??null,b?.[field]??null,b?.weekday??a?.weekday);}
 return rows;
}
