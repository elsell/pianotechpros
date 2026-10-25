import * as env from '$app/env/private';
import { parseWebConfig } from '#lib/config.js';

export function loadWebConfig() {
  return parseWebConfig({
    environment: env.PIANOTECHPROS_APP_ENV ?? 'development',
    apiURL: env.PIANOTECHPROS_API_URL ?? 'http://localhost:8080',
    oidcIssuer: env.PIANOTECHPROS_OIDC_ISSUER ?? 'http://localhost:5556/dex',
    oidcClientId: env.PIANOTECHPROS_WEB_OIDC_CLIENT_ID ?? 'pianotechpros-web',
  });
}

export const webConfig = loadWebConfig();
