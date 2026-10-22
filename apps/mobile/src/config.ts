import { clientRuntimeConfig, type ClientRuntimeConfig } from '@pianotechpros/client-core';

export function loadMobileConfig(extra: unknown): ClientRuntimeConfig {
  if (!extra || typeof extra !== 'object') throw new Error('CLIENT_RUNTIME_CONFIG');
  return clientRuntimeConfig((extra as { application?: unknown }).application);
}
