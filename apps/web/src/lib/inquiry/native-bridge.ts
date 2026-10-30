/** Reviewed provider bridge: only an ephemeral proof, never buyer/contact data. */
export function sendNativeInquiryProof(token:string){
 if(typeof window==='undefined'||token.length>2048||/[^\x21-\x7e]/.test(token))return;
 const bridge=(window as Window&{ReactNativeWebView?:{postMessage(value:string):void}}).ReactNativeWebView;
 bridge?.postMessage(JSON.stringify({type:'inquiry-proof',token}));
}
