import {parseInventoryScanLink} from './inventory-scan-link';
const lifetime=10*60*1000;
export function createInventoryScanContinuation(port:{origin:string;now():number;read():string|null;write(value:string):void;remove():void}){
 function clear(){try{port.remove();return true;}catch{return false;}}
 function peek():string|null{
  try{
   const raw=port.read();if(raw===null)return null;
   if(raw.length>2048)throw Error('invalid_continuation');
   const value:unknown=JSON.parse(raw),now=port.now();
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='expiresAt,link,version')throw Error('invalid_continuation');
   const entry=value as {version:unknown;link:unknown;expiresAt:unknown};
   if(entry.version!==1||typeof entry.link!=='string'||typeof entry.expiresAt!=='number'||!Number.isSafeInteger(entry.expiresAt)||!Number.isSafeInteger(now)||entry.expiresAt<=now||entry.expiresAt>now+lifetime)throw Error('invalid_continuation');
   parseInventoryScanLink(port.origin,entry.link);return entry.link;
  }catch{clear();return null;}
 }
 return {clear,peek,take(){const link=peek();return clear()?link:null;},save(link:string){
  if(!clear())return false;
  try{parseInventoryScanLink(port.origin,link);const now=port.now();if(!Number.isSafeInteger(now)||!Number.isSafeInteger(now+lifetime))return false;port.write(JSON.stringify({version:1,link,expiresAt:now+lifetime}));return true;}catch{clear();return false;}
 }};
}
