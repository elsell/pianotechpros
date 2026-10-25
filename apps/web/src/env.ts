import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime-only private inputs; the shared configuration parser validates them.
const optional = { schema: (value: string | undefined) => value };
export const variables = defineEnvVars({
  PIANOTECHPROS_APP_ENV: optional,
  PIANOTECHPROS_INQUIRY_CHALLENGE_POLICY: optional,
  PIANOTECHPROS_TURNSTILE_SITE_KEY: optional,
  PIANOTECHPROS_API_URL: optional,
  PIANOTECHPROS_SERVER_API_URL: optional,
  PIANOTECHPROS_PUBLIC_WEB_ORIGIN: optional,
  PIANOTECHPROS_OIDC_ISSUER: optional,
  PIANOTECHPROS_WEB_OIDC_CLIENT_ID: optional,
});
