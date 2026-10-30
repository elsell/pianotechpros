import { clientRuntimeConfig, publicEndpointConfig, inquiryChallengeConfig, type InquiryChallengeConfig, type ClientRuntimeConfig } from '@pianotechpros/client-core';

export function loadMobileConfig(extra: unknown): ClientRuntimeConfig & { webURL: string; inquiry: InquiryChallengeConfig } {
  if (!extra || typeof extra !== 'object') throw new Error('CLIENT_RUNTIME_CONFIG');
  const application = (extra as { application?: unknown }).application;
  const config = clientRuntimeConfig(application);
  const value = (application as { webURL?: unknown }).webURL;
  if (value !== undefined && typeof value !== 'string') throw new Error('WEB_URL');
  const webURL = publicEndpointConfig(value, 'http://localhost:5173', 'WEB_URL', config.environment === 'production');
  const parsed = new URL(webURL);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password ||
    !(parsed.protocol === 'https:' || config.environment === 'development' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) throw new Error('WEB_URL');
  const settings=application as {inquiryChallengePolicy?:unknown;turnstileSiteKey?:unknown};
  for(const value of [settings.inquiryChallengePolicy,settings.turnstileSiteKey])if(value!==undefined&&typeof value!=='string')throw new Error('INQUIRY_CONFIG');
  const inquiry=inquiryChallengeConfig(settings.inquiryChallengePolicy as string|undefined,settings.turnstileSiteKey as string|undefined);
  return { ...config, webURL: parsed.origin, inquiry };
}
