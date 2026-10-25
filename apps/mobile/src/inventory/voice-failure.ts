import {InventoryClientError,VoiceClientError} from '@pianotechpros/api-client';
import type {InventoryVoiceIssue} from '@pianotechpros/client-core';
export function nativeVoiceFailure(error:unknown):InventoryVoiceIssue{
 if(error instanceof InventoryClientError&&[401,403,404].includes(error.status))return 'denied';
 if(error instanceof VoiceClientError)return error.code==='unauthenticated'||error.code==='not_found'?'denied':error.code==='cancelled'?'unavailable':error.code;
 return 'unavailable';
}
