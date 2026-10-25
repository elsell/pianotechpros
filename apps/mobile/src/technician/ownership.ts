import {createTechnicianOwnershipRegistry,type TechnicianWorkspaceOwnership} from '@pianotechpros/client-core';

// One UI JavaScript runtime owns technician recovery. No background writers.
// Symbol.for preserves exclusivity across hot module replacement.
const identity=Symbol.for('pianotechpros.technician.workspace.ownership.v1');
const runtime=globalThis as typeof globalThis & {[identity]?:TechnicianWorkspaceOwnership};
export const mobileTechnicianOwnership:TechnicianWorkspaceOwnership=runtime[identity]??=createTechnicianOwnershipRegistry();
