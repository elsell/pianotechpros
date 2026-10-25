import {createTechnicianPresentationLifetime} from '@pianotechpros/client-core';
// Retain failed cleanup across actual route remounts and development refreshes.
const identity=Symbol.for('pianotechpros.technician.presentation.v1');
const runtime=globalThis as typeof globalThis&{[identity]?:ReturnType<typeof createTechnicianPresentationLifetime>};
export const mobileTechnicianPresentation=runtime[identity]??=createTechnicianPresentationLifetime();
