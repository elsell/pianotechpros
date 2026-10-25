import {createInventoryScanContinuation} from '@pianotechpros/client-core';
const key='pianotechpros_scan_continuation';
export function browserScanContinuation(){return createInventoryScanContinuation({origin:window.location.origin,now:Date.now,read:()=>window.sessionStorage.getItem(key),write:value=>window.sessionStorage.setItem(key,value),remove:()=>window.sessionStorage.removeItem(key)});}
