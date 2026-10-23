export interface DealerInvitationCode { dealerID: string; invitationID: string; token: string }
export interface DealerInvitationPreview { dealerID: string; id: string; dealerName: string; role: 'editor' | 'viewer'; expiresAt: string }
export class InvitationCodeError extends Error { constructor() { super('invalid_invitation_code'); this.name = 'InvitationCodeError'; } }
export function parseDealerInvitationCode(raw: string): DealerInvitationCode {
  if (raw.length > 4096) throw new InvitationCodeError();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new InvitationCodeError(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvitationCodeError();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'dealerID,invitationID,token' ||
      typeof row.dealerID !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.dealerID) ||
      typeof row.invitationID !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.invitationID) ||
      typeof row.token !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(row.token)) throw new InvitationCodeError();
  return { dealerID: row.dealerID, invitationID: row.invitationID, token: row.token };
}
interface JoinPort {
  preview(input: DealerInvitationCode): Promise<DealerInvitationPreview>;
  accept(input: DealerInvitationCode): Promise<{ dealerID: string; userID: string; active: boolean; grantPending: boolean }>;
  access(id: string): Promise<{ id: string }>;
}
export interface DealerJoinState { preview: DealerInvitationPreview | null; busy: boolean; accepted: boolean; grantPending: boolean; accessReady: boolean; failure: unknown }
export function createDealerJoin(actor: string, port: JoinPort) {
  const empty = (): DealerJoinState => ({ preview: null, busy: false, accepted: false, grantPending: false, accessReady: false, failure: null });
  let state = empty();
  let intent: DealerInvitationCode | null = null;
  let generation = 0;
  let disposed = false;
  const listeners = new Set<(value: DealerJoinState) => void>();
  function publish(patch: Partial<DealerJoinState>) { if (disposed) return; state = Object.freeze({ ...state, ...patch }); for (const listener of listeners) listener(state); }
  function reset() { generation++; intent = null; publish(empty()); }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (value: DealerJoinState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    reset,
    async preview(raw: string) {
      if (disposed) return;
      reset(); const expected = generation;
      publish({ busy: true });
      try {
        const parsed = parseDealerInvitationCode(raw);
        const preview = await port.preview(parsed);
        if (disposed || expected !== generation) return;
        if (preview.dealerID !== parsed.dealerID || preview.id !== parsed.invitationID || typeof preview.dealerName !== 'string' || !preview.dealerName || !['editor', 'viewer'].includes(preview.role) || !Number.isFinite(Date.parse(preview.expiresAt))) throw new Error('invitation_response_invalid');
        intent = parsed;
        publish({ preview: { dealerID: preview.dealerID, id: preview.id, dealerName: preview.dealerName, role: preview.role, expiresAt: preview.expiresAt } });
      } catch (failure) { if (expected === generation) publish({ failure }); }
      finally { if (expected === generation) publish({ busy: false }); }
    },
    async accept() {
      if (disposed || state.busy || !intent || !state.preview || state.accepted || state.accessReady) return;
      const expected = generation;
      const submitted = intent;
      publish({ busy: true, failure: null });
      try {
        const member = await port.accept(submitted);
        if (disposed || expected !== generation) return;
        if (member.dealerID !== submitted.dealerID || member.userID !== actor || !member.active || typeof member.grantPending !== 'boolean') throw new Error('invitation_response_invalid');
        intent = null;
        publish({ accepted: true, grantPending: member.grantPending });
      } catch (failure) { if (expected === generation) publish({ failure }); }
      finally { if (expected === generation) publish({ busy: false }); }
    },
    async checkAccess() {
      if (disposed || state.busy || !state.preview) return;
      const expected = generation; const id = state.preview.dealerID;
      publish({ busy: true, failure: null });
      try {
        const shop = await port.access(id);
        if (disposed || expected !== generation) return;
        if (shop.id !== id) throw new Error('invitation_response_invalid');
        intent = null; publish({ accessReady: true, grantPending: false });
      } catch (failure) { if (expected === generation) publish({ failure }); }
      finally { if (expected === generation) publish({ busy: false }); }
    },
    dispose() { disposed = true; generation++; intent = null; state = empty(); listeners.clear(); },
  });
}
