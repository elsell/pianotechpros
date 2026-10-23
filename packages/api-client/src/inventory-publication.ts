import { createApiClient } from './client';
import type { TokenProvider } from './transport';
import type { components } from './schema';
import { InventoryClientError, knownCodes, validRecord, validMoney, validDate, type InventoryErrorCode } from './inventory';

type Schema = components['schemas'];
export type InventoryPublicationState = Schema['PublicationState'];
export type PublicationReadinessField = 'form' | 'condition' | 'title' | 'photo';
export class InventoryPublicationError extends InventoryClientError {
 readonly missing: readonly PublicationReadinessField[];
 constructor(code: InventoryErrorCode, status: number, missing: PublicationReadinessField[] = []) {
  super(code, status); this.name = 'InventoryPublicationError'; this.missing = Object.freeze([...missing]);
 }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string) => Object.keys(v).sort().join(',') === names.split(' ').sort().join(',');
const text = (v: unknown, max: number, required = false): v is string => typeof v === 'string' && v.trim() === v && !/\p{Surrogate}/u.test(v) && [...v].length <= max && (!required || v.length > 0);
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
function validState(v: unknown, dealerID: string, id: string): v is InventoryPublicationState {
 if (!object(v) || !keys(v, 'record publication') || !validRecord(v.record, dealerID, id)) return false;
 if (v.publication === null) return true;
 const p = v.publication;
 if (!object(p) || !keys(p, 'visible applied_revision snapshot') || typeof p.visible !== 'boolean' || !revision(p.applied_revision) || p.applied_revision > v.record.revision) return false;
 const s = p.snapshot;
 if (!object(s) || !keys(s, 'id dealer_id publication_revision status stock_number title featured form player_system condition make model manufactured size finish description price photos')) return false;
 if (s.id !== id || s.dealer_id !== dealerID || !revision(s.publication_revision) || s.publication_revision < 2 || s.publication_revision > p.applied_revision || s.status !== v.record.status) return false;
 if (p.visible && !['available', 'reserved', 'sold'].includes(String(s.status))) return false;
 if (!text(s.title, 321, true) || !text(s.stock_number, 80, true) || !text(s.make, 160) || !text(s.model, 160) || !text(s.size, 80) || !text(s.finish, 200) || !text(s.description, 10000)) return false;
 if ([...s.title].length > 240 && (!s.make || s.title !== [s.make, s.model].filter(Boolean).join(' '))) return false;
 if (typeof s.featured !== 'boolean' || typeof s.player_system !== 'boolean' || typeof s.form !== 'string' || typeof s.condition !== 'string' || !['grand', 'full_size_upright', 'studio_upright', 'console', 'spinet'].includes(s.form) || !['new', 'used', 'restored', 'rebuilt', 'consignment', 'other'].includes(s.condition)) return false;
 if (!(s.price === null || object(s.price) && keys(s.price, 'minor_units currency') && validMoney(s.price)) || !(s.manufactured === null || object(s.manufactured) && keys(s.manufactured, 'year month day') && validDate(s.manufactured))) return false;
 if (!Array.isArray(s.photos) || !s.photos.length || s.photos.length > 50) return false;
 const ids = new Set<string>();
 for (const photo of s.photos) {
  if (!object(photo) || !keys(photo, 'id alt_text') || !text(photo.id, 128, true) || ids.has(photo.id) || !text(photo.alt_text, 240)) return false;
  ids.add(photo.id);
 }
 return true;
}
type WireResult = {response: Response; data?: unknown; error?: unknown};
export function createInventoryPublicationApiClient(baseURL: string, tokenProvider: TokenProvider) {
 const client = createApiClient(baseURL, tokenProvider);
 async function request(run: () => Promise<WireResult>, dealerID: string, id: string, signal?: AbortSignal, expectedRevision?: number, effect?: 'publish' | 'unpublish' | {status: string}): Promise<InventoryPublicationState> {
  if (!text(dealerID, 128, true) || !text(id, 128, true) || expectedRevision !== undefined && (!revision(expectedRevision) || expectedRevision >= Number.MAX_SAFE_INTEGER)) throw new InventoryPublicationError('validation_failed', 0);
  if (signal?.aborted) throw new InventoryPublicationError('network', 0);
  let result: WireResult;
  try { result = await run(); } catch (error) { throw new InventoryPublicationError(error instanceof SyntaxError ? 'protocol_error' : 'network', 0); }
  if (!result.response.ok) {
   const code = object(result.error) ? result.error.code : undefined;
   if (code === 'inventory_not_ready') {
    const missing = (result.error as Record<string, unknown>).missing;
    if (result.response.status !== 422 || !Array.isArray(missing) || !missing.length || missing.length > 4 || new Set(missing).size !== missing.length || missing.some(field => !['form', 'condition', 'title', 'photo'].includes(field))) throw new InventoryPublicationError('protocol_error', result.response.status);
    throw new InventoryPublicationError(code, result.response.status, missing as PublicationReadinessField[]);
   }
   throw new InventoryPublicationError(typeof code === 'string' && knownCodes.has(code) ? code as InventoryErrorCode : 'protocol_error', result.response.status);
  }
  if (!object(result.data) || !validState(result.data.data, dealerID, id)) throw new InventoryPublicationError('protocol_error', result.response.status);
  const state = result.data.data;
  const p = state.publication;
  if (expectedRevision !== undefined && (state.record.revision !== expectedRevision + 1 || p !== null && p.applied_revision !== state.record.revision || effect === 'publish' && (!p?.visible || p.snapshot.publication_revision !== state.record.revision) || effect === 'unpublish' && (!p || p.visible) || typeof effect === 'object' && state.record.status !== effect.status)) throw new InventoryPublicationError('protocol_error', result.response.status);
  return state;
 }
 return {
  get: (dealerID: string, id: string, signal?: AbortSignal) => request(() => client.GET('/v1/dealers/{dealerID}/inventory/{id}/publication', {params:{path:{dealerID,id}},signal}),dealerID,id,signal),
  publish: (dealerID: string, id: string, expectedRevision: number, signal?: AbortSignal) => request(() => client.POST('/v1/dealers/{dealerID}/inventory/{id}/publish',{params:{path:{dealerID,id}},body:{expectedRevision},signal}),dealerID,id,signal,expectedRevision,'publish'),
  unpublish: (dealerID: string, id: string, expectedRevision: number, signal?: AbortSignal) => request(() => client.POST('/v1/dealers/{dealerID}/inventory/{id}/unpublish',{params:{path:{dealerID,id}},body:{expectedRevision},signal}),dealerID,id,signal,expectedRevision,'unpublish'),
  transition: (dealerID: string, id: string, expectedRevision: number, status: Schema['LifecycleCommand']['status'], salePrice: Schema['Money'] | null, reason: string, signal?: AbortSignal) => {
   const amount = salePrice === null ? null : {...salePrice};
   return request(() => client.POST('/v1/dealers/{dealerID}/inventory/{id}/lifecycle',{params:{path:{dealerID,id}},body:{expectedRevision,status,salePrice:amount,reason},signal}),dealerID,id,signal,expectedRevision,{status});
  },
 };
}
