import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealerStaff, type StaffMember, type StaffInvitation, type IssuedStaffInvitation } from './dealer-staff.js';

const owner: StaffMember = { userID: 'owner', role: 'owner', revision: 1, active: true, grantPending: false };
const editor: StaffMember = { userID: 'staff', role: 'editor', revision: 1, active: true, grantPending: false };
const invitation: StaffInvitation = { id: 'invitation', role: 'viewer', expiresAt: '2030-01-01T00:00:00Z' };
function fixture() {
  let member = { ...editor };
  let failList = false;
  let calls = 0;
  const controller = createDealerStaff({
    listStaff: async (cursor) => { if (failList) throw 'unavailable'; return cursor ? { items: [member] } : { items: [owner], nextCursor: 'next' }; },
    listInvitations: async () => ({ items: [invitation] }),
    changeRole: async (userID, role, revision) => { calls++; assert.equal(userID, member.userID); if (revision !== member.revision) throw 'conflict'; member = { ...member, role, revision: revision + 1, grantPending: true }; return member; },
    remove: async (_id, revision) => { if (revision !== member.revision) throw 'conflict'; member = { ...member, revision: revision + 1, active: false }; return member; },
    createInvitation: async () => ({ ...invitation, dealerID: 'shop', dealerName: 'Shop', token: 'secret' }),
    revokeInvitation: async () => {},
  });
  return { controller, fail: () => { failList = true; }, calls: () => calls };
}

test('staff pagination and mutations preserve revisions and issued secret across refresh failure', async () => {
  const { controller: c, fail, calls } = fixture();
  await c.refresh(); await c.moreStaff();
  assert.equal(c.snapshot().members.length, 2);
  await c.changeRole(owner, 'viewer'); assert.equal(calls(), 0);
  await c.changeRole(editor, 'viewer');
  assert.equal(c.snapshot().members[1].revision, 2);
  assert.equal(c.snapshot().members[1].grantPending, true);
  await c.createInvitation('viewer', 72);
  assert.equal('token' in c.snapshot().invitations[0], false);
  fail(); await c.refresh();
  assert.equal(c.snapshot().issued?.token, 'secret');
  c.dismissIssued(); assert.equal(c.snapshot().issued, null);
});

test('late invitation creation after dispose cannot restore a secret', async () => {
  let release!: (value: IssuedStaffInvitation) => void;
  const pending = new Promise<IssuedStaffInvitation>((resolve) => { release = resolve; });
  const c = createDealerStaff({ listStaff: async () => ({ items: [] }), listInvitations: async () => ({ items: [] }), createInvitation: () => pending, changeRole: async () => editor, remove: async () => editor, revokeInvitation: async () => {} });
  await c.refresh(); const operation = c.createInvitation('viewer', 72); c.dispose();
  release({ ...invitation, dealerID: 'shop', dealerName: 'Shop', token: 'late-secret' }); await operation;
  assert.equal(c.snapshot().issued, null); assert.equal(c.snapshot().members.length, 0);
});

test('confirmed revocation clears the issued secret even when its follow-up list fails', async () => {
  let revoked = false;
  const c = createDealerStaff({
    listStaff: async () => ({ items: [owner] }),
    listInvitations: async () => { if (revoked) throw 'unavailable'; return { items: [invitation] }; },
    createInvitation: async () => ({ ...invitation, dealerID: 'shop', dealerName: 'Shop', token: 'secret' }),
    revokeInvitation: async () => { revoked = true; }, changeRole: async () => editor, remove: async () => editor,
  });
  await c.refresh(); await c.createInvitation('viewer', 72); await c.revokeInvitation(invitation);
  assert.equal(c.snapshot().issued, null); assert.equal(c.snapshot().ready, false);
});
