import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionLifecycle } from './session-lifecycle';

type Session = { token: string; expiresAt: string };
const session: Session = { token: 'synthetic-session', expiresAt: '2030-01-01T00:00:00Z' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('sign-out deletion follows an already-started secure-storage write', async () => {
  let stored: Session | null = null;
  const started = deferred();
  const finish = deferred();
  const lifecycle = createSessionLifecycle(async (next) => {
    if (next) { started.resolve(); await finish.promise; }
    stored = next;
  });
  const old = lifecycle.capture();
  const writing = old.persist(session);
  await started.promise;
  const clearing = lifecycle.clear();
  assert.equal(old.current(), false);
  const stale = old.persist(session);
  finish.resolve();
  await Promise.all([writing, clearing, stale]);
  assert.equal(stored, null);
  const next = lifecycle.capture();
  await next.persist(session);
  assert.equal(stored, session);
});

test('failed storage mutation does not prevent subsequent sign-out deletion', async () => {
  const writes: (Session | null)[] = [];
  const lifecycle = createSessionLifecycle(async (next) => {
    writes.push(next);
    if (next) throw new Error('storage unavailable');
  });
  await assert.rejects(lifecycle.capture().persist(session));
  await lifecycle.clear();
  assert.deepEqual(writes, [session, null]);
});

test('failed sign-out leaves completion unreported and permits explicit retry', async () => {
  let stored: Session | null = session;
  let failDeletion = true;
  let signedOut = false;
  const lifecycle = createSessionLifecycle(async (next) => {
    if (!next && failDeletion) throw new Error('secure storage unavailable');
    stored = next;
  });
  const lease = lifecycle.capture();
  await assert.rejects(lifecycle.clear().then(() => { signedOut = true; }));
  assert.equal(signedOut, false);
  assert.equal(stored, session);
  assert.equal(lease.current(), false);
  failDeletion = false;
  await lifecycle.clear().then(() => { signedOut = true; });
  assert.equal(signedOut, true);
  assert.equal(stored, null);
});
