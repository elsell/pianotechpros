export interface CustomerLocationForm {key:string;label:string;street1:string;street2:string;city:string;region:string;postalCode:string;timezone:string;notes:string}
export interface CustomerPianoForm {key:string;locationKey:string;nickname:string;form:string;make:string;model:string;serial:string;manufacturedYear:string;player:boolean;notes:string}
export interface CustomerForm {name:string;isBusiness:boolean;businessName:string;email:string;phone:string;locations:CustomerLocationForm[];pianos:CustomerPianoForm[]}
export interface CustomerWireAttributes {name:string;isBusiness:boolean;businessName?:string;email:string;phone?:string;locations:(Omit<CustomerLocationForm,'street2'|'notes'>&{street2?:string;notes?:string})[];pianos:(Omit<CustomerPianoForm,'make'|'model'|'serial'|'notes'|'manufacturedYear'>&{make?:string;model?:string;serial?:string;notes?:string;manufacturedYear?:number|null})[]}
export interface CustomerFormIssue {path:string;code:'required'|'invalid'|'too_long'|'duplicate'|'limit'}
export const customerPianoForms=['grand','full_size_upright','studio_upright','console','spinet','other'] as const;
const key=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,50}$/.test(v);
export function emptyCustomerForm():CustomerForm{return {name:'',isBusiness:false,businessName:'',email:'',phone:'',locations:[],pianos:[]};}
export function copyCustomerForm(f:CustomerForm):CustomerForm{return {...f,locations:f.locations.map(l=>({...l})),pianos:f.pianos.map(p=>({...p}))};}
export function customerFormFromAttributes(a:CustomerWireAttributes):CustomerForm{return {name:a.name,isBusiness:a.isBusiness,businessName:a.businessName??'',email:a.email,phone:a.phone??'',locations:a.locations.map(l=>({...l,street2:l.street2??'',notes:l.notes??''})),pianos:a.pianos.map(p=>({...p,make:p.make??'',model:p.model??'',serial:p.serial??'',notes:p.notes??'',manufacturedYear:p.manufacturedYear==null?'':String(p.manufacturedYear)}))};}
function controls(value:string,multiline=false){return [...value].some(c=>{const n=c.codePointAt(0)!;return n>=0xd800&&n<=0xdfff||n<32&&!(multiline&&[9,10,13].includes(n))||n>=127&&n<=159;});}
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
export function customerFormIssues(f:CustomerForm,zones:ReadonlySet<string>):CustomerFormIssue[]{
 const issues:CustomerFormIssue[]=[];
 const issue=(path:string,code:CustomerFormIssue['code'])=>issues.push({path,code});
 const text=(path:string,value:string,min:number,max:number,multi=false)=>{const length=[...value.trim()].length;if(controls(value,multi))issue(path,'invalid');else if(length<min)issue(path,min===1?'required':'invalid');else if(length>max)issue(path,'too_long');};
 text('name',f.name,1,200);text('businessName',f.businessName,f.isBusiness?1:0,200);text('email',f.email,1,320);if(f.email.trim()&&!controls(f.email)&&!mailbox(f.email.trim()))issue('email','invalid');text('phone',f.phone,0,32);
 if(f.locations.length<1||f.locations.length>50)issue('locations','limit');if(f.pianos.length>200)issue('pianos','limit');
 const locations=new Set<string>();
 for(const l of f.locations){const path=`locations.${l.key}`;if(!key(l.key))issue(path+'.key','invalid');if(locations.has(l.key))issue(path+'.key','duplicate');locations.add(l.key);
  text(path+'.label',l.label,1,100);text(path+'.street1',l.street1,1,200);text(path+'.street2',l.street2,0,200);text(path+'.city',l.city,1,100);text(path+'.region',l.region,1,64);text(path+'.postalCode',l.postalCode,3,20);
  if(!zones.has(l.timezone)||l.timezone==='Local'||l.timezone==='localtime'||!/^[-+A-Za-z0-9_]+(?:\/[-+A-Za-z0-9_]+)*$/.test(l.timezone)||l.timezone.length>64)issue(path+'.timezone','invalid');text(path+'.notes',l.notes,0,2000,true);
 }
 const pianos=new Set<string>();
 for(const p of f.pianos){const path=`pianos.${p.key}`;if(!key(p.key))issue(path+'.key','invalid');if(pianos.has(p.key))issue(path+'.key','duplicate');pianos.add(p.key);if(!locations.has(p.locationKey))issue(path+'.locationKey','invalid');
  text(path+'.nickname',p.nickname,1,100);if(!(customerPianoForms as readonly string[]).includes(p.form))issue(path+'.form','invalid');text(path+'.make',p.make,0,100);text(path+'.model',p.model,0,100);text(path+'.serial',p.serial,0,100);
  const year=p.manufacturedYear.trim();if(year!==''&&(!/^\d{4}$/.test(year)||Number(year)<1700||Number(year)>2100)||controls(p.manufacturedYear))issue(path+'.manufacturedYear','invalid');text(path+'.notes',p.notes,0,2000,true);
 }
 return issues;
}
export function customerAttributes(f:CustomerForm,zones:ReadonlySet<string>):CustomerWireAttributes {
 if(customerFormIssues(f,zones).length)throw new Error('invalid_customer_form');
 return {name:f.name.trim(),isBusiness:f.isBusiness,businessName:f.businessName.trim(),email:f.email.trim(),phone:f.phone.trim(),locations:f.locations.map(l=>({key:l.key,label:l.label.trim(),street1:l.street1.trim(),street2:l.street2.trim(),city:l.city.trim(),region:l.region.trim(),postalCode:l.postalCode.trim(),timezone:l.timezone,notes:l.notes.trim()})),pianos:f.pianos.map(p=>({key:p.key,locationKey:p.locationKey,nickname:p.nickname.trim(),form:p.form,make:p.make.trim(),model:p.model.trim(),serial:p.serial.trim(),manufacturedYear:p.manufacturedYear.trim()===''?null:Number(p.manufacturedYear),player:p.player,notes:p.notes.trim()}))};
}
export function addCustomerLocation(f:CustomerForm,newKey:()=>string):CustomerForm|null {if(f.locations.length>=50)return null;const id=newKey();if(!key(id)||f.locations.some(l=>l.key===id))return null;const next=copyCustomerForm(f);next.locations.push({key:id,label:'',street1:'',street2:'',city:'',region:'',postalCode:'',timezone:'',notes:''});return next;}
export function addCustomerPiano(f:CustomerForm,locationKey:string,newKey:()=>string):CustomerForm|null {if(f.pianos.length>=200||!f.locations.some(l=>l.key===locationKey))return null;const id=newKey();if(!key(id)||f.pianos.some(p=>p.key===id))return null;const next=copyCustomerForm(f);next.pianos.push({key:id,locationKey,nickname:'',form:'',make:'',model:'',serial:'',manufacturedYear:'',player:false,notes:''});return next;}
export function removeCustomerLocation(f:CustomerForm,id:string,confirmed:boolean):CustomerForm|null {if(!confirmed||f.locations.length<=1||!f.locations.some(l=>l.key===id)||f.pianos.some(p=>p.locationKey===id))return null;const next=copyCustomerForm(f);next.locations=next.locations.filter(l=>l.key!==id);return next;}
export function removeCustomerPiano(f:CustomerForm,id:string,confirmed:boolean):CustomerForm|null {if(!confirmed||!f.pianos.some(p=>p.key===id))return null;const next=copyCustomerForm(f);next.pianos=next.pianos.filter(p=>p.key!==id);return next;}
export function reassignCustomerPiano(f:CustomerForm,id:string,location:string):CustomerForm|null {if(!f.locations.some(l=>l.key===location)||!f.pianos.some(p=>p.key===id))return null;const next=copyCustomerForm(f);next.pianos.find(p=>p.key===id)!.locationKey=location;return next;}

export function isCustomerForm(value:unknown):value is CustomerForm {
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const strings=(v:Record<string,unknown>,keys:string[])=>keys.every(k=>typeof v[k]==='string'&&(v[k] as string).length<=10000);
 const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
 if(!object(value)||!exact(value,['name','isBusiness','businessName','email','phone','locations','pianos'])||!strings(value,['name','businessName','email','phone'])||typeof value.isBusiness!=='boolean'||!Array.isArray(value.locations)||value.locations.length>50||!Array.isArray(value.pianos)||value.pianos.length>200)return false;
 const locationFields=['key','label','street1','street2','city','region','postalCode','timezone','notes'];
 const pianoFields=['key','locationKey','nickname','form','make','model','serial','manufacturedYear','notes'];
 return value.locations.every(l=>object(l)&&exact(l,locationFields)&&strings(l,locationFields)&&key(l.key as string))&&value.pianos.every(p=>object(p)&&exact(p,[...pianoFields,'player'])&&strings(p,pianoFields)&&key(p.key as string)&&typeof p.player==='boolean');
}
