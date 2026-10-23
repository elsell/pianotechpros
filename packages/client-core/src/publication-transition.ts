import {inventoryMoneyFromInput} from './inventory-form';
import type {PublicationCommand} from './inventory-publication-workspace';
export const publicationStatuses=['draft','available','reserved','in_service','sold','archived'] as const;
export interface PublicationTransitionInput {status:string;amount:string;currency:string;reason:string}
export function publicationTransitionFromInput(input:PublicationTransitionInput,currentStatus:string,decimal:'.'|','):Extract<PublicationCommand,{kind:'transition'}>{
 const reason=input.reason.trim();
 if(!(publicationStatuses as readonly string[]).includes(input.status)||/\p{Surrogate}/u.test(reason)||[...reason].length>1000||((currentStatus==='sold'||currentStatus==='archived'||input.status==='draft')&&!reason))throw new Error('invalid_publication_transition');
 const salePrice=input.status==='sold'?inventoryMoneyFromInput(input.amount,input.currency,decimal):null;
 if(input.status==='sold'&&!salePrice)throw new Error('invalid_publication_transition');
 return {kind:'transition',status:input.status as typeof publicationStatuses[number],salePrice,reason};
}
