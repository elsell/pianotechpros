export type InventoryScanTarget={dealerID:string;token:string};
const validID=(id:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(id);
const validToken=(value:string)=>/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)&&value!=='A'.repeat(43);
const invalid=()=>new Error('invalid_scan_link');
function scanOrigin(value:string):string{
 if(value.length>512||/[\\\u0000-\u0020\u007f]/.test(value))throw invalid();
 let url:URL;try{url=new URL(value);}catch{throw invalid();}
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw invalid();
 return url.origin;
}
export function createInventoryScanLink(origin:string,dealerID:string,token:string):string{
 if(!validID(dealerID)||!validToken(token))throw invalid();
 return `${scanOrigin(origin)}/scan#v=1&dealer=${dealerID}&token=${token}`;
}
export function parseInventoryScanLink(origin:string,value:string):InventoryScanTarget{
 if(typeof value!=='string'||value.length>1024||/[\\\u0000-\u0020\u007f]/.test(value))throw invalid();
 let url:URL;try{url=new URL(value);}catch{throw invalid();}
 const expected=scanOrigin(origin);
 if(url.origin!==expected||url.username||url.password||url.pathname!=='/scan'||url.search)throw invalid();
 const fields=new URLSearchParams(url.hash.slice(1));
 const dealerID=fields.get('dealer')??'',token=fields.get('token')??'';
 if(createInventoryScanLink(expected,dealerID,token)!==value)throw invalid();
 return {dealerID,token};
}
