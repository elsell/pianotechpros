import { clientRuntimeConfig, type ClientRuntimeConfig } from '@pianotechpros/client-core';

export function parseWebConfig(value: unknown): ClientRuntimeConfig {
  return clientRuntimeConfig(value);
}
