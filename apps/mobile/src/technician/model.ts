import {copyTechnicianForm,moveTechnicianRule,technicianServices,technicianPianoForms,type TechnicianForm} from '@pianotechpros/client-core';
export type TechnicianSection={kind:'overview'|'contact'|'origin'|'work'|'availability'}|{kind:'rule';key:string};
export function technicianSection(path:string):TechnicianSection{const p=path.split('.');return p[0]==='availability'?(p.length===3?{kind:'rule',key:p[1]!}:{kind:'availability'}):p[0]==='origin'||['radiusMiles','drivingMinutes'].includes(p[0]!)?{kind:'origin'}:['services','forms','searchable','acceptsRequestsWithoutAvailability'].includes(p[0]!)?{kind:'work'}:{kind:'contact'};}
export function applyTechnicianValue(form:TechnicianForm,path:string,value:string|boolean|string[]):TechnicianForm{
 const f=copyTechnicianForm(form),p=path.split('.');
 if(p[0]==='availability'&&p.length===3){const r=f.availability.find(r=>r.key===p[1]);if(!r)return f;if(p[2]==='weekday')return moveTechnicianRule(f,r.key,Number(value))??f;if(['kind','start','end','timezone','effectiveStart','effectiveEnd'].includes(p[2]!)&&typeof value==='string')Object.assign(r,{[p[2]!]:value});}
 else if(p[0]==='origin'&&p.length===2&&['label','street1','street2','city','region','postalCode','timezone'].includes(p[1]!)&&typeof value==='string')Object.assign(f.origin,{[p[1]!]:value});
 else if(p.length===1){if(['name','businessName','email','phone','biography','radiusMiles','drivingMinutes'].includes(path)&&typeof value==='string')Object.assign(f,{[path]:value});else if(['searchable','acceptsRequestsWithoutAvailability'].includes(path)&&typeof value==='boolean')Object.assign(f,{[path]:value});else if(['services','forms'].includes(path)&&typeof value==='object')Object.assign(f,{[path]:[...value]});}
 return f;
}
export function technicianChoice(f:TechnicianForm,path:string,zones:string[]){
 let options:{value:string;labelKey?:string}[]=[],selected:string[]=[],multiple=false;
 const p=path.split('.'),r=p[0]==='availability'?f.availability.find(r=>r.key===p[1]):undefined;
 if(p[0]==='availability'&&!r)return null;
 if(path==='origin.timezone'||r&&p[2]==='timezone'){options=zones.map(value=>({value}));selected=[r?r.timezone:f.origin.timezone];}
 else if(path==='services'||path==='forms'){multiple=true;options=(path==='services'?technicianServices:technicianPianoForms).map(value=>({value,labelKey:`technician.${path==='services'?'service':'form'}.${value}`}));selected=[...f[path]];}
 else if(r&&p[2]==='weekday'){options=[0,1,2,3,4,5,6].filter(n=>!f.availability.some(other=>other.key!==r.key&&other.weekday===n)).map(n=>({value:n.toString(),labelKey:`technician.day.${n}`}));selected=[r.weekday.toString()];}
 else if(r&&p[2]==='kind'){options=['available','unavailable'].map(value=>({value,labelKey:`technician.kind.${value}`}));selected=[r.kind];}
 else return null;
 return {path,options,selected,multiple};
}
