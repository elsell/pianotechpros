import { createApiClient } from './client';
import type { TokenProvider } from './transport';
import type { components } from './schema';

type Schema = components['schemas'];
export type DealerProfile = Schema['DealerItem'];
export type DealerProfileInput = Omit<Schema['DealerCreate'], '$schema'>;
export type DealerStaffMember = Schema['StaffMember'];
export type DealerStaffRole = Schema['StaffRoleChange']['role'];
export type DealerInvitation = Schema['StaffInvitationSummary'];
export type DealerPage<T> = { items: T[]; nextCursor?: string };
export type DealerErrorCode = Schema['APIError']['code'] | 'network' | 'protocol_error';

export const dealerErrorCodes = new Set<string>([
  'invalid_photo', 'photo_limit_exceeded', 'invalid_invitation', 'bad_request', 'unauthenticated', 'invalid_credential',
  'forbidden', 'not_found', 'conflict', 'idempotency_conflict', 'validation_failed',
  'rate_limited', 'authorization_pending', 'authorization_dead_lettered',
  'authorization_policy_not_configured', 'unavailable', 'internal_error',
  'request_failed', 'oidc_discovery_unavailable',
] satisfies Schema['APIError']['code'][]);

/** Safe machine data only: never attach the response, request or original cause. */
export class DealerClientError extends Error {
  constructor(readonly code: DealerErrorCode, readonly status: number) {
    super(code);
    this.name = 'DealerClientError';
  }
}

type Result<T> = { response: Response; data?: T; error?: unknown };
async function execute<T>(request: () => Promise<Result<T>>): Promise<Result<T>> {
  let result: Result<T>;
  try { result = await request(); }
  catch (error) { throw new DealerClientError(error instanceof SyntaxError ? 'protocol_error' : 'network', 0); }
  if (!result.response.ok) {
    const error = result.error;
    const candidate = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const code = typeof candidate === 'string' && dealerErrorCodes.has(candidate) ? candidate as Schema['APIError']['code'] : 'protocol_error';
    throw new DealerClientError(code, result.response.status);
  }
  return result;
}
async function item<T>(request: () => Promise<Result<{ data: T }>>): Promise<T> {
  const result = await execute(request);
  if (!result.data || !result.data.data || typeof result.data.data !== 'object' || Array.isArray(result.data.data)) throw new DealerClientError('protocol_error', result.response.status);
  return result.data.data;
}
async function page<T>(request: () => Promise<Result<{ data: T[]; meta: { nextCursor?: string } }>>): Promise<DealerPage<T>> {
  const result = await execute(request);
  const body = result.data;
  if (!body || !Array.isArray(body.data) || !body.meta || (body.meta.nextCursor !== undefined && typeof body.meta.nextCursor !== 'string')) throw new DealerClientError('protocol_error', result.response.status);
  return { items: body.data, nextCursor: body.meta.nextCursor || undefined };
}

export function createDealerApiClient(baseURL: string, tokenProvider: TokenProvider) {
  const client = createApiClient(baseURL, tokenProvider);
  return {
    list: (cursor?: string) => page(() => client.GET('/v1/dealers', { params: { query: { cursor, limit: 50 } } })),
    get: (id: string) => item(() => client.GET('/v1/dealers/{id}', { params: { path: { id } } })),
    create: (profile: DealerProfileInput, idempotencyKey: string) => item(() => client.POST('/v1/dealers', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: profile })),
    update: (id: string, profile: DealerProfileInput, expectedRevision: number) => item(() => client.PUT('/v1/dealers/{id}', { params: { path: { id } }, body: { ...profile, expectedRevision } })),
    listStaff: (id: string, cursor?: string) => page(() => client.GET('/v1/dealers/{id}/staff', { params: { path: { id }, query: { cursor, limit: 50 } } })),
    listInvitations: (id: string, cursor?: string) => page(() => client.GET('/v1/dealers/{id}/staff-invitations', { params: { path: { id }, query: { cursor, limit: 50 } } })),
    changeStaffRole: (id: string, userID: string, role: DealerStaffRole, expectedRevision: number) => item(() => client.PUT('/v1/dealers/{id}/staff/{userID}/role', { params: { path: { id, userID } }, body: { role, expectedRevision } })),
    removeStaff: (id: string, userID: string, expectedRevision: number) => item(() => client.POST('/v1/dealers/{id}/staff/{userID}/revoke', { params: { path: { id, userID } }, body: { expectedRevision } })),
    createInvitation: (id: string, role: DealerStaffRole, expiresInHours = 72) => item(() => client.POST('/v1/dealers/{id}/staff-invitations', { params: { path: { id } }, body: { role, expiresInHours } })),
    previewInvitation: (id: string, invitationID: string, token: string) => item(() => client.POST('/v1/dealers/{id}/staff-invitations/{invitationID}/preview', { params: { path: { id, invitationID } }, body: { token } })),
    acceptInvitation: (id: string, invitationID: string, token: string) => item(() => client.POST('/v1/dealers/{id}/staff-invitations/{invitationID}/accept', { params: { path: { id, invitationID } }, body: { token } })),
    revokeInvitation: async (id: string, invitationID: string): Promise<void> => { await execute(() => client.POST('/v1/dealers/{id}/staff-invitations/{invitationID}/revoke', { params: { path: { id, invitationID } } })); },
  };
}
