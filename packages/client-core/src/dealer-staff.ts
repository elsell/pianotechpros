export type StaffRole = 'editor' | 'viewer';
export interface StaffMember { userID: string; role: StaffRole | 'owner'; revision: number; active: boolean; grantPending: boolean }
export interface StaffInvitation { id: string; role: StaffRole; expiresAt: string; consumedAt?: string; revokedAt?: string }
export interface IssuedStaffInvitation extends StaffInvitation { dealerID: string; dealerName: string; token: string }
type Page<T> = { items: T[]; nextCursor?: string };
export interface DealerStaffPort {
  listStaff(cursor?: string): Promise<Page<StaffMember>>;
  listInvitations(cursor?: string): Promise<Page<StaffInvitation>>;
  changeRole(userID: string, role: StaffRole, revision: number): Promise<StaffMember>;
  remove(userID: string, revision: number): Promise<StaffMember>;
  createInvitation(role: StaffRole, expiresInHours: number): Promise<IssuedStaffInvitation>;
  revokeInvitation(id: string): Promise<void>;
}
export interface DealerStaffState {
  members: readonly StaffMember[];
  invitations: readonly StaffInvitation[];
  memberCursor?: string;
  invitationCursor?: string;
  issued: IssuedStaffInvitation | null;
  busy: boolean;
  ready: boolean;
  failure: unknown;
}
export function createDealerStaff(port: DealerStaffPort, accessDenied: (failure: unknown) => boolean) {
  const empty = (): DealerStaffState => ({ members: [], invitations: [], issued: null, busy: false, ready: false, failure: null });
  let state = empty();
  let disposed = false;
  const listeners = new Set<(state: DealerStaffState) => void>();
  function publish(patch: Partial<DealerStaffState>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener(state);
  }
  function rejectAccess(failure: unknown) {
    publish({ ...empty(), busy: state.busy, memberCursor: undefined, invitationCursor: undefined, failure });
  }
  async function observeAccess<T>(request: Promise<T>): Promise<T> {
    try { return await request; }
    catch (failure) {
      // Clear immediately, even while the sibling list request is pending.
      if (accessDenied(failure)) rejectAccess(failure);
      throw failure;
    }
  }
  async function run(work: () => Promise<void>, needsReady = true) {
    if (disposed || state.busy || (needsReady && !state.ready)) return;
    publish({ busy: true, failure: null });
    try { await work(); }
    catch (failure) { publish(accessDenied(failure) ? { ...empty(), memberCursor: undefined, invitationCursor: undefined, failure } : { failure, ready: false }); }
    finally { publish({ busy: false }); }
  }
  const merge = <T>(old: readonly T[], next: T[], id: (row: T) => string) => [...new Map([...old, ...next].map((row) => [id(row), row])).values()];
  function replaceMember(member: StaffMember) { publish({ members: state.members.map((row) => row.userID === member.userID ? member : row) }); }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (value: DealerStaffState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    refresh: () => run(async () => {
      const results = await Promise.allSettled([observeAccess(port.listStaff()), observeAccess(port.listInvitations())]);
      const rejected = results.filter((result) => result.status === 'rejected');
      if (rejected.length) throw (rejected.find((result) => accessDenied(result.reason)) ?? rejected[0]).reason;
      const [memberResult, invitationResult] = results;
      if (memberResult.status !== 'fulfilled' || invitationResult.status !== 'fulfilled') return;
      const members = memberResult.value; const invitations = invitationResult.value;
      publish({ members: members.items, memberCursor: members.nextCursor, invitations: invitations.items, invitationCursor: invitations.nextCursor, ready: true });
    }, false),
    moreStaff: () => run(async () => { if (!state.memberCursor) return; const page = await port.listStaff(state.memberCursor); publish({ members: merge(state.members, page.items, (row) => row.userID), memberCursor: page.nextCursor }); }),
    moreInvitations: () => run(async () => { if (!state.invitationCursor) return; const page = await port.listInvitations(state.invitationCursor); publish({ invitations: merge(state.invitations, page.items, (row) => row.id), invitationCursor: page.nextCursor }); }),
    changeRole: (member: StaffMember, role: StaffRole) => run(async () => {
      if (member.role === 'owner' || !member.active || member.grantPending) return;
      replaceMember(await port.changeRole(member.userID, role, member.revision));
    }),
    remove: (member: StaffMember) => run(async () => {
      if (member.role === 'owner' || !member.active) return;
      replaceMember(await port.remove(member.userID, member.revision));
    }),
    createInvitation: (role: StaffRole, hours: number) => run(async () => {
      if (state.issued) return;
      const issued = await port.createInvitation(role, hours);
      const summary: StaffInvitation = { id: issued.id, role: issued.role, expiresAt: issued.expiresAt };
      publish({ issued, invitations: merge(state.invitations, [summary], (row) => row.id) });
    }),
    revokeInvitation: (invitation: StaffInvitation) => run(async () => {
      if (invitation.consumedAt || invitation.revokedAt) return;
      await port.revokeInvitation(invitation.id);
      if (disposed) return;
      publish({ issued: state.issued?.id === invitation.id ? null : state.issued });
      const page = await port.listInvitations();
      publish({ invitations: page.items, invitationCursor: page.nextCursor, issued: state.issued?.id === invitation.id ? null : state.issued });
    }),
    dismissIssued() { publish({ issued: null }); },
    dispose() { disposed = true; state = empty(); listeners.clear(); },
  });
}
