import { createApiClient } from './client';
import type { TokenProvider } from './transport';
export { createApiClient } from './client';
export type { TokenProvider } from './transport';
export { sessionExpiryAdvanced, sessionRefreshDelay, sessionRefreshLeadMs } from './session';

export function createSessionApiClient(baseUrl: string, tokenProvider: TokenProvider) {
  const client = createApiClient(baseUrl, tokenProvider);
  return {
    exchange: (identityToken: string) => client.POST('/v1/sessions', { body: { identityToken } }),
    refresh: () => client.POST('/v1/session/refresh'),
    profile: () => client.GET('/v1/me'),
    revoke: () => client.DELETE('/v1/session'),
  };
}

export { createDealerApiClient, DealerClientError, type DealerProfile, type DealerProfileInput, type DealerStaffMember, type DealerStaffRole, type DealerInvitation, type DealerPage, type DealerErrorCode } from './dealer';
export { createInventoryApiClient, InventoryClientError, type InventoryRecord, type InventoryListOptions, type InventoryPage, type InventoryAttributes, type InventoryErrorCode } from './inventory';
export { createInventoryPhotoApiClient, type InventoryPhoto, type InventoryPhotoState, type InventoryPhotoUpload } from './inventory-photos';
