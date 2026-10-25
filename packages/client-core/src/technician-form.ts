export interface TechnicianOriginForm {label:string;street1:string;street2:string;city:string;region:string;postalCode:string;timezone:string}
export interface TechnicianRuleForm {key:string;kind:string;recurrence:string;weekday:number;start:string;end:string;timezone:string;effectiveStart:string;effectiveEnd:string}
export interface TechnicianForm {name:string;businessName:string;email:string;phone:string;biography:string;searchable:boolean;acceptsRequestsWithoutAvailability:boolean;origin:TechnicianOriginForm;radiusMiles:string;drivingMinutes:string;services:string[];forms:string[];availability:TechnicianRuleForm[]}
export interface TechnicianWireAttributes {name:string;businessName?:string;email:string;phone?:string;biography?:string;searchable:boolean;acceptsRequestsWithoutAvailability:boolean;origin:Omit<TechnicianOriginForm,'street2'>&{street2?:string};radiusMiles:number;drivingMinutes?:number|null;services:string[];forms:string[];availability:(Omit<TechnicianRuleForm,'kind'|'recurrence'|'effectiveStart'|'effectiveEnd'>&{kind:'available'|'unavailable';recurrence:'weekly';effectiveStart?:string;effectiveEnd?:string})[]}
export interface TechnicianFormIssue {path:string;code:'required'|'invalid'|'too_long'|'duplicate'|'limit'}
export const technicianServices=['tuning','voicing','regulation','repair','other'] as const;
export const technicianPianoForms=['spinet','console','studio_upright','upright','grand','other'] as const;
const key=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,50}$/.test(v);
export function emptyTechnicianForm():TechnicianForm {return {name:'',businessName:'',email:'',phone:'',biography:'',searchable:false,acceptsRequestsWithoutAvailability:false,origin:{label:'',street1:'',street2:'',city:'',region:'',postalCode:'',timezone:''},radiusMiles:'',drivingMinutes:'',services:[],forms:[],availability:[]};}
export function copyTechnicianForm(f:TechnicianForm):TechnicianForm{return {...f,origin:{...f.origin},services:[...f.services],forms:[...f.forms],availability:f.availability.map(r=>({...r}))};}
export function technicianFormFromAttributes(a:TechnicianWireAttributes):TechnicianForm{return {...a,businessName:a.businessName??'',phone:a.phone??'',biography:a.biography??'',origin:{...a.origin,street2:a.origin.street2??''},radiusMiles:String(a.radiusMiles),drivingMinutes:a.drivingMinutes==null?'':String(a.drivingMinutes),services:[...a.services],forms:[...a.forms],availability:a.availability.map(r=>({...r,effectiveStart:r.effectiveStart??'',effectiveEnd:r.effectiveEnd??''}))};}
function controls(value:string,multiline=false){return [...value].some(c=>{const n=c.codePointAt(0)!;return n>=0xd800&&n<=0xdfff||n<32&&!(multiline&&[9,10,13].includes(n))||n>=127&&n<=159;});}
const localTime=(v:string)=>/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
function date(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000'))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function mailbox(value:string){
 // Match exact net/mail addr-specs: quoted local parts are decoded by that
 // parser and therefore fail the server's exact-address comparison.
 const split=value.lastIndexOf('@');if(split<=0)return false;
 const local=value.slice(0,split),domain=value.slice(split+1);
 const atom=/^[^\s<>()[\]\\,;:@".]+$/u;
 if(!local.split('.').every(part=>part!==''&&atom.test(part)))return false;
 if(domain.startsWith('[')&&domain.endsWith(']')){
  const literal=domain.slice(1,-1);
  if(!literal.includes(':'))return literal.split('.').length===4&&literal.split('.').every(part=>/^(0|[1-9][0-9]{0,2})$/.test(part)&&Number(part)<=255);
  try{return new URL('http://'+domain).hostname.startsWith('[');}catch{return false;}
 }
 return domain.split('.').every(part=>part!==''&&atom.test(part));
}
export function technicianFormIssues(f:TechnicianForm,zones:ReadonlySet<string>):TechnicianFormIssue[]{
 const issues:TechnicianFormIssue[]=[];const issue=(path:string,code:TechnicianFormIssue['code'])=>issues.push({path,code});
 const text=(path:string,value:string,min:number,max:number,multi=false)=>{const n=[...value.trim()].length;if(controls(value,multi))issue(path,'invalid');else if(n<min)issue(path,min===1?'required':'invalid');else if(n>max)issue(path,'too_long');};
 const zone=(path:string,value:string)=>{if(value==='')issue(path,'required');else if(value.length>64||!zones.has(value)||value==='Local'||value==='localtime'||!/^[-+A-Za-z0-9_]+(?:\/[-+A-Za-z0-9_]+)*$/.test(value))issue(path,'invalid');};
 const numeric=(path:string,value:string,min:number,max:number,optional=false)=>{const v=value.trim();if(!v&&!optional)issue(path,'required');else if(controls(value)||v!==''&&(!/^\d+$/.test(v)||Number(v)<min||Number(v)>max))issue(path,'invalid');};
 text('name',f.name,1,200);text('businessName',f.businessName,0,200);text('email',f.email,1,320);if(f.email.trim()&&!controls(f.email)&&!mailbox(f.email.trim()))issue('email','invalid');text('phone',f.phone,0,32);text('biography',f.biography,0,2000,true);
 text('origin.label',f.origin.label,1,100);text('origin.street1',f.origin.street1,1,200);text('origin.street2',f.origin.street2,0,200);text('origin.city',f.origin.city,1,100);text('origin.region',f.origin.region,1,64);text('origin.postalCode',f.origin.postalCode,3,20);zone('origin.timezone',f.origin.timezone);
 numeric('radiusMiles',f.radiusMiles,1,500);numeric('drivingMinutes',f.drivingMinutes,1,1440,true);
 for(const [path,values,allowed] of [['services',f.services,technicianServices],['forms',f.forms,technicianPianoForms]] as const){if(f.searchable&&values.length===0)issue(path,'required');if(values.length>allowed.length)issue(path,'limit');if(values.some(v=>!(allowed as readonly string[]).includes(v)))issue(path,'invalid');if(new Set(values).size!==values.length)issue(path,'duplicate');}
 if(f.availability.length>7)issue('availability','limit');if(f.searchable&&f.availability.length===0&&!f.acceptsRequestsWithoutAvailability)issue('availability','required');
 const keys=new Set<string>(),days=new Set<number>();
 for(const r of f.availability){const p='availability.'+r.key;
  if(!key(r.key))issue(p+'.key','invalid');if(keys.has(r.key))issue(p+'.key','duplicate');keys.add(r.key);
  if(!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6)issue(p+'.weekday','invalid');if(days.has(r.weekday))issue(p+'.weekday','duplicate');days.add(r.weekday);
  if(!['available','unavailable'].includes(r.kind))issue(p+'.kind','invalid');if(r.recurrence!=='weekly')issue(p+'.recurrence','invalid');
  if(!localTime(r.start))issue(p+'.start',r.start===''?'required':'invalid');if(!localTime(r.end)||localTime(r.start)&&r.start>=r.end)issue(p+'.end',r.end===''?'required':'invalid');zone(p+'.timezone',r.timezone);
  if(r.effectiveStart!==''&&!date(r.effectiveStart))issue(p+'.effectiveStart','invalid');if(r.effectiveEnd!==''&&(!date(r.effectiveEnd)||date(r.effectiveStart)&&r.effectiveStart>r.effectiveEnd))issue(p+'.effectiveEnd','invalid');
 }
 return issues;
}
export function technicianAttributes(f:TechnicianForm,zones:ReadonlySet<string>):TechnicianWireAttributes {
 if(technicianFormIssues(f,zones).length)throw new Error('invalid_technician_form');
 const o=f.origin;
 return {name:f.name.trim(),businessName:f.businessName.trim(),email:f.email.trim(),phone:f.phone.trim(),biography:f.biography.trim(),searchable:f.searchable,acceptsRequestsWithoutAvailability:f.acceptsRequestsWithoutAvailability,origin:{label:o.label.trim(),street1:o.street1.trim(),street2:o.street2.trim(),city:o.city.trim(),region:o.region.trim(),postalCode:o.postalCode.trim(),timezone:o.timezone},radiusMiles:Number(f.radiusMiles.trim()),drivingMinutes:f.drivingMinutes.trim()===''?null:Number(f.drivingMinutes.trim()),services:[...f.services],forms:[...f.forms],availability:f.availability.map(r=>({...r,kind:r.kind as 'available'|'unavailable',recurrence:'weekly'}))};
}
export function addTechnicianRule(f:TechnicianForm,newKey:()=>string):TechnicianForm|null {
 if(f.availability.length>=7)return null;const day=[0,1,2,3,4,5,6].find(d=>!f.availability.some(r=>r.weekday===d));if(day===undefined)return null;
 const id=newKey();if(!key(id)||f.availability.some(r=>r.key===id))return null;
 const next=copyTechnicianForm(f);next.availability.push({key:id,kind:'available',recurrence:'weekly',weekday:day,start:'09:00',end:'17:00',timezone:f.origin.timezone,effectiveStart:'',effectiveEnd:''});return next;
}
export function removeTechnicianRule(f:TechnicianForm,id:string,confirmed:boolean):TechnicianForm|null {if(!confirmed||!f.availability.some(r=>r.key===id))return null;const next=copyTechnicianForm(f);next.availability=next.availability.filter(r=>r.key!==id);return next;}
export function moveTechnicianRule(f:TechnicianForm,id:string,weekday:number):TechnicianForm|null {if(!Number.isInteger(weekday)||weekday<0||weekday>6||!f.availability.some(r=>r.key===id)||f.availability.some(r=>r.key!==id&&r.weekday===weekday))return null;const next=copyTechnicianForm(f);next.availability.find(r=>r.key===id)!.weekday=weekday;return next;}
export function isTechnicianForm(v:unknown):v is TechnicianForm {
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
 const strings=(v:Record<string,unknown>,keys:string[])=>keys.every(k=>typeof v[k]==='string'&&(v[k] as string).length<=10000);
 const fields=['name','businessName','email','phone','biography','radiusMiles','drivingMinutes'],origin=['label','street1','street2','city','region','postalCode','timezone'],rule=['key','kind','recurrence','start','end','timezone','effectiveStart','effectiveEnd'];
 if(!obj(v)||!exact(v,[...fields,'searchable','acceptsRequestsWithoutAvailability','origin','services','forms','availability'])||!strings(v,fields)||typeof v.searchable!=='boolean'||typeof v.acceptsRequestsWithoutAvailability!=='boolean'||!obj(v.origin)||!exact(v.origin,origin)||!strings(v.origin,origin))return false;
 for(const [values,max] of [[v.services,5],[v.forms,6]] as const){if(!Array.isArray(values)||values.length>max||!values.every(x=>typeof x==='string'&&x.length<=10000))return false;}
 return Array.isArray(v.availability)&&v.availability.length<=7&&v.availability.every(r=>obj(r)&&exact(r,[...rule,'weekday'])&&strings(r,rule)&&key(r.key)&&typeof r.weekday==='number'&&Number.isInteger(r.weekday)&&r.weekday>=0&&r.weekday<=6);
}
