import {Share} from 'react-native';
import type {PublicSharingPort} from '@pianotechpros/client-core';
export const nativePublicSharing:PublicSharingPort={
 share:async value=>{
  const result=await Share.share({message:value.url,title:value.title});
  if(result.action===Share.dismissedAction){
   const error=new Error('cancelled');
   error.name='AbortError';
   throw error;
  }
 },
 copy:async()=>{throw new Error('clipboard_unavailable');},
};
