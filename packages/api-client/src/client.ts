import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { createAuthenticatedFetch, type TokenProvider } from './transport';

export function createApiClient(baseUrl: string, tokenProvider: TokenProvider) {
  return createClient<paths>({ baseUrl, fetch: createAuthenticatedFetch(tokenProvider) });
}
