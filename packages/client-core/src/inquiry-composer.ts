export type InquiryContactFields={name:string;email:string;phone:string;message:string;preference:string};
export type InquiryContactField=keyof InquiryContactFields;
export type InquiryDeliveryIssue='invalid_input'|'challenge_rejected'|'rate_limited'|'not_found'|'unavailable'|'network'|'protocol_error';
export type InquiryComposerState={fields:InquiryContactFields;errors:InquiryContactField[];issue:InquiryDeliveryIssue|null;busy:boolean;delivered:boolean};
const blank=():InquiryContactFields=>({name:'',email:'',phone:'',message:'',preference:'email'});
const bytes=(value:string)=>[...value].reduce((total,char)=>{const code=char.codePointAt(0)!;return total+(code<128?1:code<2048?2:code<65536?3:4);},0);
export function validateInquiryContact(fields:InquiryContactFields):{ok:true;contact:InquiryContactFields&{preference:'email'|'phone'|'either'}}|{ok:false;errors:InquiryContactField[]}{
 const errors:InquiryContactField[]=[];const contact={...fields,name:fields.name.trim(),email:fields.email.trim(),phone:fields.phone.trim(),message:fields.message.trim()};
 for(const field of ['name','email','phone','message'] as const){
  const value=fields[field];const canonical=contact[field];const max=field==='name'?120:field==='email'?254:field==='phone'?40:4000;
  if(/\p{Surrogate}/u.test(value)||/[\p{Cc}]/u.test(field==='message'?value.replace(/[\n\t]/g,''):value)||[...canonical].length>max||field!=='phone'&&!canonical)errors.push(field);
 }
 if((bytes(contact.email)>254||!contact.email.includes('@'))&&!errors.includes('email'))errors.push('email');
 if(!['email','phone','either'].includes(contact.preference))errors.push('preference');
 if(contact.preference==='phone'&&!contact.phone&&!errors.includes('phone'))errors.push('phone');
 return errors.length?{ok:false,errors}:{ok:true,contact:contact as InquiryContactFields&{preference:'email'|'phone'|'either'}};
}
export function createInquiryComposer(port:{submit(body:InquiryContactFields&{challenge:string;honeypot:string},signal:AbortSignal):Promise<void>;classify(error:unknown):InquiryDeliveryIssue;changed?():void}){
 let state:InquiryComposerState={fields:blank(),errors:[],issue:null,busy:false,delivered:false};let disposed=false;let active:AbortController|null=null;
 const changed=()=>{if(!disposed)port.changed?.();};
 return {
  state:():InquiryComposerState=>({...state,fields:{...state.fields},errors:[...state.errors]}),
  set(field:InquiryContactField,value:string){if(disposed||state.busy||state.delivered)return;state={...state,fields:{...state.fields,[field]:value},errors:state.errors.filter(key=>key!==field),issue:null};changed();},
  async submit(challenge:string,honeypot:string):Promise<void>{
   if(disposed||state.busy||state.delivered)return;
   const result=validateInquiryContact(state.fields);if(!result.ok){state={...state,errors:result.errors,issue:null};changed();return;}
   const controller=new AbortController();active=controller;state={...state,busy:true,errors:[],issue:null};changed();
   if(disposed||active!==controller)return;
   try{await port.submit({...result.contact,challenge,honeypot},controller.signal);if(disposed||active!==controller)return;state={fields:blank(),errors:[],issue:null,busy:false,delivered:true};}
   catch(error){if(disposed||active!==controller)return;state={...state,busy:false,issue:port.classify(error)};}
   finally{if(!disposed&&active===controller){active=null;changed();}}
  },
  dispose(){disposed=true;active?.abort();active=null;state={fields:blank(),errors:[],issue:null,busy:false,delivered:false};},
 };
}
