import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionLifecycle } from '@pianotechpros/client-core';
import { activateExchangedSession } from './session-establishment';

type Session = { token: string; expiresAt: string };
const session: Session = { token: 'synthetic-session', expiresAt: '2030-01-01T00:00:00Z' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

for (const outcome of ['success', 'transient failure']) {
  test(`sign-out ignores a late ${outcome} that tries to retain a session`, async () => {
    let stored: Session | null = session;
    const lifecycle = createSessionLifecycle(async (next) => { stored = next; });
    const lease = lifecycle.capture();
    const response = deferred();
    let commits = 0;
    const pending = activateExchangedSession(session, async (next) => {
      await response.promise;
      if (outcome === 'transient failure') throw { kind: 'http', status: 503 };
      await lease.persist(next);
      if (lease.current()) commits++;
    }, lease.persist);
    await lifecycle.clear();
    response.resolve();
    await pending;
    assert.equal(stored, null);
    assert.equal(commits, 0);
  });
}

