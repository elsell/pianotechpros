import type {components} from './schema';
export type TechnicianProfile=components['schemas']['TechnicianProfileItem'];
export type TechnicianProfileAttributes=components['schemas']['TechnicianProfileAttributes'];
export type TechnicianProfileOrigin=components['schemas']['TechnicianProfileOrigin'];
export type TechnicianWeeklyRule=components['schemas']['TechnicianWeeklyRule'];
export const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fields=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export const key=(v:unknown,max=128):v is string=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9_-]+$/.test(v);
export const revision=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function text(v:unknown,min:number,max:number,multiline=false):v is string {
 if(typeof v!=='string'||[...v.trim()].length<min||[...v.trim()].length>max)return false;
 for(const ch of v){const code=ch.codePointAt(0)!;if(code>=0xd800&&code<=0xdfff||code<32&&!(multiline&&[9,10,13].includes(code))||code>=127&&code<=159)return false;}
 return true;
}
const optional=(v:unknown,max:number,multiline=false)=>v===undefined||text(v,0,max,multiline);
const zone=(v:unknown):v is string=>typeof v==='string'&&v.length<=64&&v!=='Local'&&v!=='localtime'&&/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const localTime=(v:unknown):v is string=>typeof v==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
function date(v:unknown):v is string {
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000'))return false;
 const parsed=new Date(v+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v;
}
const selections=(v:unknown,allowed:string[]):v is string[]=>Array.isArray(v)&&v.length<=allowed.length&&v.every(s=>typeof s==='string'&&allowed.includes(s))&&new Set(v).size===v.length;
export function validAttributes(v:unknown):v is TechnicianProfileAttributes {
 if(!object(v)||!fields(v,['name','businessName','email','phone','biography','searchable','acceptsRequestsWithoutAvailability','origin','radiusMiles','drivingMinutes','services','forms','availability'])||!text(v.name,1,200)||!optional(v.businessName,200)||!text(v.email,1,320)||!optional(v.phone,32)||!optional(v.biography,2000,true)||typeof v.searchable!=='boolean'||typeof v.acceptsRequestsWithoutAvailability!=='boolean'||!integer(v.radiusMiles,1,500)||(v.drivingMinutes!==undefined&&v.drivingMinutes!==null&&!integer(v.drivingMinutes,1,1440)))return false;
 const o=v.origin;
 if(!object(o)||!fields(o,['label','street1','street2','city','region','postalCode','timezone'])||!text(o.label,1,100)||!text(o.street1,1,200)||!optional(o.street2,200)||!text(o.city,1,100)||!text(o.region,1,64)||!text(o.postalCode,3,20)||!zone(o.timezone))return false;
 if(!selections(v.services,['tuning','voicing','regulation','repair','other'])||!selections(v.forms,['spinet','console','studio_upright','upright','grand','other'])||!Array.isArray(v.availability)||v.availability.length>7)return false;
 const keys=new Set<string>(),days=new Set<number>();
 for(const r of v.availability){
  if(!object(r)||!fields(r,['key','kind','recurrence','weekday','start','end','timezone','effectiveStart','effectiveEnd'])||!key(r.key,50)||keys.has(r.key)||!integer(r.weekday,0,6)||days.has(r.weekday)||(r.kind!=='available'&&r.kind!=='unavailable')||r.recurrence!=='weekly'||!localTime(r.start)||!localTime(r.end)||r.start>=r.end||!zone(r.timezone))return false;
  if(r.effectiveStart!==undefined&&r.effectiveStart!==''&&!date(r.effectiveStart)||r.effectiveEnd!==undefined&&r.effectiveEnd!==''&&!date(r.effectiveEnd))return false;
  if(typeof r.effectiveStart==='string'&&r.effectiveStart!==''&&typeof r.effectiveEnd==='string'&&r.effectiveEnd!==''&&r.effectiveStart>r.effectiveEnd)return false;
  keys.add(r.key);days.add(r.weekday);
 }
 return !v.searchable||(v.services.length>0&&v.forms.length>0&&(v.availability.length>0||v.acceptsRequestsWithoutAvailability));
}
function utc(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value))return false;
 const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===value.slice(0,19);
}
const instant=(v:string)=>v.slice(0,19)+'.'+(v.includes('.')?v.slice(20,-1):'').padEnd(6,'0');
export function validProfile(v:unknown):v is TechnicianProfile {
 return object(v)&&fields(v,['id','revision','createdAt','updatedAt','attributes'])&&key(v.id)&&revision(v.revision)&&utc(v.createdAt)&&utc(v.updatedAt)&&instant(v.updatedAt)>=instant(v.createdAt)&&validAttributes(v.attributes);
}
export function validTimezones(v:unknown):v is {names:string[]} {
 if(!object(v)||!fields(v,['names'])||!Array.isArray(v.names))return false;
 const names=v.names;return names.length>0&&names.length<=1000&&names.includes('UTC')&&names.every((name,i)=>zone(name)&&(i===0||names[i-1]<name));
}

export function copyAttributes(a:TechnicianProfileAttributes):TechnicianProfileAttributes {return {...a,origin:{...a.origin},services:[...a.services],forms:[...a.forms],availability:a.availability.map(r=>({...r}))};}
