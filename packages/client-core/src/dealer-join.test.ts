import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealerJoin, parseDealerInvitationCode, InvitationCodeError } from './dealer-join.js';

const secret = 'A'.repeat(43);
const code = JSON.stringify({ dealerID: 'shop', invitationID: 'invite', token: secret });
const preview = { dealerID: 'shop', id: 'invite', dealerName: 'Shop', role: 'viewer' as const, expiresAt: '2030-01-01T00:00:00Z' };
const member = { dealerID: 'shop', userID: 'recipient', active: true, grantPending: true };

test('bounded invitation parsing rejects malformed values without echoing secrets', () => {
  assert.deepEqual(parseDealerInvitationCode(code), { dealerID: 'shop', invitationID: 'invite', token: secret });
  for (const raw of ['', secret, code + 'x', JSON.stringify({ dealerID: 'shop', invitationID: 'invite', token: secret, extra: true }), JSON.stringify({ dealerID: 'shop', invitationID: 'invite', token: 'secret' }), 'x'.repeat(4097)]) {
    assert.throws(() => parseDealerInvitationCode(raw), (error: unknown) => error instanceof InvitationCodeError && !error.message.includes(secret));
  }
});

test('join requires preview, clears its token after accept, and checks ordinary access', async () => {
  let accepts = 0; let access = false;
  const c = createDealerJoin('recipient', {
    preview: async (input) => { assert.equal(input.token, secret); return { ...preview, unexpectedToken: secret }; },
    accept: async () => { accepts++; return member; },
    access: async () => { if (!access) throw 'not_found'; return { id: 'shop' }; },
  });
  await c.accept(); assert.equal(accepts, 0);
  await c.preview(code); assert.ok(!JSON.stringify(c.snapshot()).includes(secret)); await c.accept();
  assert.equal(c.snapshot().accepted, true); assert.equal(c.snapshot().grantPending, true);
  assert.ok(!JSON.stringify(c.snapshot()).includes(secret));
  await c.accept(); assert.equal(accepts, 1);
  await c.checkAccess(); assert.equal(c.snapshot().accessReady, false);
  access = true; await c.checkAccess(); assert.equal(c.snapshot().accessReady, true);
  c.dispose(); assert.equal(c.snapshot().preview, null);
});

test('changing code discards late preview and prevents accepting the old code', async () => {
  let release!: (value: typeof preview) => void; let accepts = 0;
  const pending = new Promise<typeof preview>((resolve) => { release = resolve; });
  const c = createDealerJoin('recipient', { preview: () => pending, accept: async () => { accepts++; return member; }, access: async () => ({ id: 'shop' }) });
  const request = c.preview(code); c.reset(); release(preview); await request; await c.accept();
  assert.equal(c.snapshot().preview, null); assert.equal(accepts, 0);
});

test('lost acceptance response can recover through ordinary access without another accept', async () => {
  let granted = false;
  const c = createDealerJoin('recipient', { preview: async () => preview, accept: async () => { granted = true; throw 'network'; }, access: async () => { assert.ok(granted); return { id: 'shop' }; } });
  await c.preview(code); await c.accept(); assert.equal(c.snapshot().accepted, false);
  await c.checkAccess(); assert.equal(c.snapshot().accessReady, true);
});

test('mismatched preview and acceptance identities never establish access', async () => {
  let wrongPreview = true;
  const c = createDealerJoin('recipient', {
    preview: async () => wrongPreview ? { ...preview, dealerID: 'other-shop' } : preview,
    accept: async () => ({ ...member, userID: 'other-user' }),
    access: async () => ({ id: 'other-shop' }),
  });
  await c.preview(code); assert.equal(c.snapshot().preview, null);
  wrongPreview = false; await c.preview(code); await c.accept();
  assert.equal(c.snapshot().accepted, false);
  await c.checkAccess(); assert.equal(c.snapshot().accessReady, false);
});

test('late acceptance after disposal cannot repopulate the next screen', async () => {
  let release!: (value: typeof member) => void;
  const pending = new Promise<typeof member>((resolve) => { release = resolve; });
  const c = createDealerJoin('recipient', { preview: async () => preview, accept: () => pending, access: async () => ({ id: 'shop' }) });
  await c.preview(code); const accepting = c.accept(); c.dispose(); release(member); await accepting;
  assert.equal(c.snapshot().accepted, false); assert.equal(c.snapshot().preview, null);
});
