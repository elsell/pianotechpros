import encodeQR from 'qr';
import {createInventoryScanLink} from './inventory-scan-link';
/** Pure local encoding; callers render black modules on a white quiet zone. */
export function inventoryScanMatrix(origin:string,dealerID:string,token:string):boolean[][]{
 const link=createInventoryScanLink(origin,dealerID,token);
 try{return encodeQR(link,'raw',{ecc:'quartile',border:4,textEncoder:text=>Uint8Array.from(text,character=>character.charCodeAt(0))});}
 catch{throw new Error('scan_label_unavailable');}
}
