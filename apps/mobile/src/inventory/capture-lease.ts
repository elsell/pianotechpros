import {createInventoryCaptureLease} from '@pianotechpros/client-core';
export const claimMobileInventoryCapture=createInventoryCaptureLease();

const photos=createInventoryCaptureLease();
export const claimMobileInventoryPhotos=(userID:string,dealerID:string,recordID:string)=>photos(userID,JSON.stringify([dealerID,recordID]));
