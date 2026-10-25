import type {components} from './schema';
export type CustomerProfile=components['schemas']['ProfileItem'];
export type CustomerProfileAttributes=components['schemas']['ProfileAttributes'];
export type CustomerProfileLocation=components['schemas']['ProfileLocation'];
export type CustomerProfilePiano=components['schemas']['ProfilePiano'];
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
export function validAttributes(v:unknown):v is CustomerProfileAttributes {
 if(!object(v)||!fields(v,['name','isBusiness','businessName','email','phone','locations','pianos'])||!text(v.name,1,200)||typeof v.isBusiness!=='boolean'||!optional(v.businessName,200)||(v.isBusiness&&!text(v.businessName,1,200))||!text(v.email,1,320)||!optional(v.phone,32)||!Array.isArray(v.locations)||v.locations.length<1||v.locations.length>50||!Array.isArray(v.pianos)||v.pianos.length>200)return false;
 const locations=new Set<string>();
 for(const l of v.locations){
  if(!object(l)||!fields(l,['key','label','street1','street2','city','region','postalCode','timezone','notes'])||!key(l.key,50)||locations.has(l.key)||!text(l.label,1,100)||!text(l.street1,1,200)||!optional(l.street2,200)||!text(l.city,1,100)||!text(l.region,1,64)||!text(l.postalCode,3,20)||!zone(l.timezone)||!optional(l.notes,2000,true))return false;
  locations.add(l.key);
 }
 const pianos=new Set<string>();
 for(const p of v.pianos){
  if(!object(p)||!fields(p,['key','locationKey','nickname','form','make','model','serial','notes','manufacturedYear','player'])||!key(p.key,50)||pianos.has(p.key)||typeof p.locationKey!=='string'||!locations.has(p.locationKey)||!text(p.nickname,1,100)||typeof p.form!=='string'||!['grand','full_size_upright','studio_upright','console','spinet','other'].includes(p.form)||!optional(p.make,100)||!optional(p.model,100)||!optional(p.serial,100)||!optional(p.notes,2000,true)||typeof p.player!=='boolean'||p.manufacturedYear!==undefined&&p.manufacturedYear!==null&&(!Number.isInteger(p.manufacturedYear)||typeof p.manufacturedYear!=='number'||p.manufacturedYear<1700||p.manufacturedYear>2100))return false;
  pianos.add(p.key);
 }
 return true;
}
function utc(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value))return false;
 const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===value.slice(0,19);
}
const instant=(v:string)=>v.slice(0,19)+'.'+(v.includes('.')?v.slice(20,-1):'').padEnd(6,'0');
export function validProfile(v:unknown):v is CustomerProfile {
 return object(v)&&fields(v,['id','revision','createdAt','updatedAt','attributes'])&&key(v.id)&&revision(v.revision)&&utc(v.createdAt)&&utc(v.updatedAt)&&instant(v.updatedAt)>=instant(v.createdAt)&&validAttributes(v.attributes);
}
export function validTimezones(v:unknown):v is {names:string[]} {
 if(!object(v)||!fields(v,['names'])||!Array.isArray(v.names))return false;
 const names=v.names;return names.length>0&&names.length<=1000&&names.includes('UTC')&&names.every((name,i)=>zone(name)&&(i===0||names[i-1]<name));
}

export function copyAttributes(a:CustomerProfileAttributes):CustomerProfileAttributes { return {...a,locations:a.locations.map(l=>({...l})),pianos:a.pianos.map(p=>({...p}))}; }
