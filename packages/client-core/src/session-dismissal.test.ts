import assert from 'node:assert/strict';
import test from 'node:test';
import { dismissSession } from './session-dismissal.js';

test('private presentation blocks before storage deletion and remains blocked on failure', async () => {
  let blocked = false; let ready = true; let failed = false; let completed = false;
  const ports = {
    block: () => { blocked = true; ready = false; },
    clear: async () => { assert.equal(blocked, true); assert.equal(ready, false); if (!failed) { failed = true; throw new Error('storage unavailable'); } },
    failed: () => { ready = true; },
    complete: () => { completed = true; ready = true; },
  };
  assert.equal(await dismissSession(ports), false);
  assert.equal(blocked, true); assert.equal(ready, true); assert.equal(completed, false);
  assert.equal(await dismissSession(ports), true); assert.equal(completed, true);
});
