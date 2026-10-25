import {DealerClientError} from './dealer';
import {InventoryClientError} from './inventory';
import {InquiryClientError} from './inquiry';
import {VoiceClientError} from './inventory-voice';
import {TechnicianProfileClientError} from './technician-profile';
import {CustomerProfileClientError} from './customer-profile';

/** A retired credential cannot revoke the replacement or erase its recovery. */
export function sessionScopedFailure(error:unknown,dispatchedToken:string,currentToken:string|null):unknown {
 if(!currentToken||currentToken===dispatchedToken)return error;
 if(error instanceof DealerClientError&&error.status===401)return new DealerClientError('unavailable',503);
 if(error instanceof InventoryClientError&&error.status===401)return new InventoryClientError('unavailable',503);
 if(error instanceof InquiryClientError&&error.status===401)return new InquiryClientError('unavailable',503);
 if(error instanceof VoiceClientError&&error.status===401)return new VoiceClientError('unavailable',503);
 if(error instanceof CustomerProfileClientError&&error.status===401)return new CustomerProfileClientError('unavailable',503);
 if(error instanceof TechnicianProfileClientError&&error.status===401)return new TechnicianProfileClientError('unavailable',503);
 return error;
}
