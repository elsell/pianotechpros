// Reviewed provider boundary: fixed Cloudflare script, no application credentials or contact data.
type Provider={render(element:HTMLElement,options:Record<string,unknown>):string|undefined;remove(id:string):void;reset(id:string):void};
let pending:Promise<Provider>|null=null;
function provider():Provider|undefined{return (window as Window&{turnstile?:Provider}).turnstile;}
function load():Promise<Provider>{
 const ready=provider();if(ready)return Promise.resolve(ready);
 if(pending)return pending;
 pending=new Promise<Provider>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  let settled=false;
  const finish=(value?:Provider)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(value)resolve(value);else{script.remove();pending=null;reject(new Error('challenge_unavailable'));}};
  const timer=setTimeout(()=>finish(),15000);
  script.onload=()=>finish(provider());script.onerror=()=>finish();document.head.append(script);
 });return pending;
}
export function mountInquiryChallenge(element:HTMLElement,siteKey:string,language:string,changed:(token:string,failed:boolean)=>void){
 let disposed=false;let widget:string|undefined;let api:Provider|undefined;
 const emit=(token='',failed=false)=>{if(!disposed)changed(token,failed);};
 void load().then(value=>{if(disposed)return;api=value;widget=value.render(element,{sitekey:siteKey,action:'inquiry',language,theme:'light',size:'flexible','response-field':false,callback:(token:unknown)=>{const valid=typeof token==='string'&&token.length>0&&token.length<=2048;emit(valid?token:'',!valid);},'expired-callback':()=>emit(),'error-callback':()=>{emit('',true);return true;},'timeout-callback':()=>emit('',true)});if(widget===undefined)emit('',true);}).catch(()=>emit('',true));
 return {reset(){if(disposed)return;emit();if(widget!==undefined&&api){try{api.reset(widget);}catch{emit('',true);}}},dispose(){disposed=true;if(widget!==undefined&&api){try{api.remove(widget);}catch{/* Teardown cannot expose provider errors. */}}}};
}
