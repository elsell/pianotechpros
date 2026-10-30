/** Ephemeral proof ownership. Server verification is always authoritative. */
export function createInquiryProof(pageURL:string){
 let current:object|null=null,token='';
 const clear=()=>{current=null;token='';};
 return {
  restart(){clear();current={};return current;},
  clear,
  current:(instance:object)=>current===instance,
  ready:()=>token.length>0,
  receive(instance:object,source:string,data:string){
   if(current!==instance)return false;
   token='';
   if(source!==pageURL||data.length>2200)return false;
   try{
    const value:unknown=JSON.parse(data);
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const payload=value as Record<string,unknown>;
    if(Object.keys(payload).length!==2||payload.type!=='inquiry-proof'||typeof payload.token!=='string'||payload.token.length>2048||/[^\x21-\x7e]/.test(payload.token))return false;
    token=payload.token;return true;
   }catch{return false;}
  },
  take(){const proof=token;clear();return proof;},
 };
}
/** Navigation is confined to the hosted page; provider frames never become app links. */
export function inquiryVerificationNavigation(pageURL:string,url:string,isTopFrame?:boolean):boolean{
 return url===pageURL||isTopFrame===false&&(url==='about:blank'||url==='about:srcdoc'||url.startsWith('https://challenges.cloudflare.com/'));
}

/** Guard every native callback, including provider errors, against retired views. */
export function inquiryProofCallbacks(proof:ReturnType<typeof createInquiryProof>,instance:object,changed:()=>void,failed:()=>void){
 const fail=()=>{if(!proof.current(instance))return;proof.clear();changed();failed();};
 return {fail,message(source:string,data:string){if(!proof.current(instance))return;if(proof.receive(instance,source,data))changed();else fail();}};
}
