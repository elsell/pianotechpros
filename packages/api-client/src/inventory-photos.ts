import { createApiClient } from './client';
import type { TokenProvider } from './transport';
import type { components } from './schema';
import { InventoryClientError, knownCodes, validRecord, type InventoryErrorCode } from './inventory';

type Schema = components['schemas'];
export type InventoryPhotoState = Schema['PhotoState'];
export type InventoryPhoto = Schema['Photo'];
export type InventoryPhotoUpload = InventoryPhotoState & Schema['PhotoUploadMeta'];
const maxBytes = 20 * 1024 * 1024;
const base = '/v1/dealers/{dealerID}/inventory/{id}/photos' as const;
const detail = '/v1/dealers/{dealerID}/inventory/{id}/photos/{photoID}' as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validID = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim() === value && [...value].length <= 128;
function validState(value: unknown, dealerID: string, id: string): value is InventoryPhotoState {
 if (!object(value) || !validRecord(value.record, dealerID, id) || !Array.isArray(value.photos) || value.photos.length > 50) return false;
 const ids = new Set<string>();
 for (const photo of value.photos) {
  if (!object(photo) || !validID(photo.id) || ids.has(photo.id) || typeof photo.altText !== 'string' || [...photo.altText].length > 240 || photo.altText.trim() !== photo.altText) return false;
  ids.add(photo.id);
 }
 return true;
}
type WireResult = {response: Response; data?: unknown; error?: unknown};
async function request(run: () => Promise<WireResult>): Promise<WireResult> {
 let result: WireResult;
 try { result = await run(); }
 catch (error) { throw new InventoryClientError(error instanceof SyntaxError ? 'protocol_error' : 'network', 0); }
 if (!result.response.ok) {
  const code = object(result.error) ? result.error.code : undefined;
  throw new InventoryClientError(typeof code === 'string' && knownCodes.has(code) ? code as InventoryErrorCode : 'protocol_error', result.response.status);
 }
 return result;
}
async function state(run: () => Promise<WireResult>, dealerID: string, id: string): Promise<InventoryPhotoState> {
 const result = await request(run);
 if (!object(result.data) || !validState(result.data.data, dealerID, id)) throw new InventoryClientError('protocol_error', result.response.status);
 return result.data.data;
}
export function createInventoryPhotoApiClient(baseURL: string, tokenProvider: TokenProvider) {
 const client = createApiClient(baseURL, tokenProvider);
 return {
  list: (dealerID: string, id: string, signal?: AbortSignal) => state(() => client.GET(base, {params:{path:{dealerID,id}}, signal}), dealerID, id),
  upload: async (dealerID: string, id: string, source: Uint8Array, key: string, expectedRevision: number, signal?: AbortSignal): Promise<InventoryPhotoUpload> => {
   if (!source.byteLength) throw new InventoryClientError('invalid_photo', 0);
   if (source.byteLength > maxBytes) throw new InventoryClientError('photo_limit_exceeded', 0);
   // Snapshot synchronously, before the token provider or fetch can yield.
   const bytes = new Uint8Array(source).buffer;
   const result = await request(() => client.POST(base, {
    params:{path:{dealerID,id},header:{'Idempotency-Key':key},query:{expectedRevision}},
    body:'', bodySerializer:() => bytes, headers:{'Content-Type':'application/octet-stream'}, signal,
   }));
   const body = result.data;
   if (!object(body) || !validState(body.data, dealerID, id) || !object(body.meta) || !validID(body.meta.photoID) || typeof body.meta.replay !== 'boolean') throw new InventoryClientError('protocol_error', result.response.status);
   const {photoID,replay} = body.meta;
   if (!replay && !body.data.photos.some(photo => photo.id === photoID)) throw new InventoryClientError('protocol_error', result.response.status);
   return {...body.data,photoID,replay};
  },
  reorder: (dealerID: string, id: string, ids: readonly string[], expectedRevision: number, signal?: AbortSignal) => {
   const snapshot = [...ids];
   return state(() => client.PUT('/v1/dealers/{dealerID}/inventory/{id}/photos/order', {params:{path:{dealerID,id}},body:{ids:snapshot,expectedRevision},signal}), dealerID, id);
  },
  describe: (dealerID: string, id: string, photoID: string, altText: string, expectedRevision: number, signal?: AbortSignal) => state(() => client.PATCH(detail,{params:{path:{dealerID,id,photoID}},body:{altText,expectedRevision},signal}),dealerID,id),
  remove: (dealerID: string, id: string, photoID: string, expectedRevision: number, signal?: AbortSignal) => state(() => client.DELETE(detail,{params:{path:{dealerID,id,photoID},query:{expectedRevision}},signal}),dealerID,id),
  image: async (dealerID: string, id: string, photoID: string, signal?: AbortSignal): Promise<Uint8Array> => {
   const result = await request(() => client.GET('/v1/dealers/{dealerID}/inventory/{id}/photos/{photoID}/image',{params:{path:{dealerID,id,photoID}},parseAs:'arrayBuffer',signal}));
   if (result.response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/jpeg' || !(result.data instanceof ArrayBuffer) || result.data.byteLength > maxBytes || result.data.byteLength < 4) throw new InventoryClientError('protocol_error',result.response.status);
   const bytes = new Uint8Array(result.data);
   if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new InventoryClientError('protocol_error',result.response.status);
   return bytes;
  },
 };
}
