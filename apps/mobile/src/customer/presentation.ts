import {createCustomerPresentationLifetime} from '@pianotechpros/client-core';
// Retain failed cleanup across actual route remounts and development refreshes.
const identity=Symbol.for('pianotechpros.customer.presentation.v1');
const runtime=globalThis as typeof globalThis&{[identity]?:ReturnType<typeof createCustomerPresentationLifetime>};
export const mobileCustomerPresentation=runtime[identity]??=createCustomerPresentationLifetime();
