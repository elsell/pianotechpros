import { clientRuntimeConfig, type ClientRuntimeConfig } from '@pianotechpros/client-core';

export function parseWebConfig(value: unknown): ClientRuntimeConfig {
  return clientRuntimeConfig(value);
}

// Server-only callers may use a different address without changing browser data.
export function parseServerApiURL(value: string | undefined, browser: ClientRuntimeConfig): string {
  const configured = value === undefined ? browser.apiURL : value;
  const url = new URL(configured);
  if (!configured.trim() || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('SERVER_API_URL');
  return clientRuntimeConfig({ ...browser, apiURL: configured }).apiURL;
}
