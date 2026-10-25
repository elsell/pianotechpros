import {createCustomerOwnershipRegistry,type CustomerWorkspaceOwnership} from '@pianotechpros/client-core';

// One UI JavaScript runtime owns customer recovery. No background writers.
// Symbol.for preserves exclusivity across hot module replacement.
const identity=Symbol.for('pianotechpros.customer.workspace.ownership.v1');
const runtime=globalThis as typeof globalThis & {[identity]?:CustomerWorkspaceOwnership};
export const mobileCustomerOwnership:CustomerWorkspaceOwnership=runtime[identity]??=createCustomerOwnershipRegistry();
