import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealerEditor } from './dealer-editor.js';
const profile = { id: 'shop', revision: 1, name: 'Original' };

test('conflicting edits require fetched revision and explicit approval without replacing the draft', async () => {
  let revision = 2; let name = 'Other edit';
  const c = createDealerEditor({ initial: profile, key: () => 'key', rejectedBeforeCreation: () => false, conflict: (error) => error === 'conflict',
    create: async () => profile, get: async () => ({ ...profile, revision, name }),
    update: async (_id: string, input: { name: string }, expected: number) => { if (expected !== revision) throw 'conflict'; name = input.name; return { ...profile, name, revision: ++revision }; },
  });
  await c.save({ name: 'My edit' }); assert.equal(c.snapshot().conflict, true);
  await c.save({ name: 'My edit' }); assert.equal(revision, 2);
  c.keepEdits(); assert.equal(c.snapshot().conflict, true);
  await c.review(); assert.equal(c.snapshot().latest?.name, 'Other edit');
  assert.equal(c.snapshot().conflict, true);
  c.keepEdits(); await c.save({ name: 'My edit' });
  assert.equal(c.snapshot().saved?.name, 'My edit'); assert.equal(revision, 3);
});

test('uncertain creation locks dismissal and reuses the first snapshot and reservation', async () => {
  let first = true; let calls = 0;
  const c = createDealerEditor<{ name: string }, typeof profile>({ initial: null, key: () => 'stable', conflict: () => false, rejectedBeforeCreation: () => false,
    get: async () => profile, update: async () => profile,
    create: async (input, key) => { calls++; assert.equal(key, 'stable'); assert.equal(input.name, 'Original'); if (first) { first = false; throw 'network'; } return profile; },
  });
  await c.save({ name: 'Original' }); assert.equal(c.snapshot().uncertain, true);
  await c.save({ name: 'Changed' }); assert.equal(c.snapshot().saved?.id, 'shop');
  assert.equal(c.snapshot().uncertain, false); assert.equal(calls, 2);
});

test('disposal suppresses late saves and reviews and coalesces concurrent save commands', async () => {
  let resolve!: (value: typeof profile) => void; let calls = 0;
  const pending = new Promise<typeof profile>((done) => { resolve = done; });
  const c = createDealerEditor<{ name: string }, typeof profile>({ initial: profile, key: () => 'key', conflict: () => false, rejectedBeforeCreation: () => false,
    create: async () => profile, get: () => pending, update: () => { calls++; return pending; },
  });
  const saving = c.save({ name: 'Edit' }); await c.save({ name: 'Other' }); c.dispose(); resolve(profile); await saving;
  assert.equal(calls, 1); assert.equal(c.snapshot().saved, null);
});

test('review rejects another shop or older revision and disposal suppresses a pending review', async () => {
  let current = { ...profile, id: 'other' };
  let resolve!: (value: typeof profile) => void;
  let defer = false;
  const c = createDealerEditor<{ name: string }, typeof profile>({ initial: profile, key: () => 'key', conflict: (error) => error === 'conflict', rejectedBeforeCreation: () => false,
    create: async () => profile, update: async () => { throw 'conflict'; },
    get: async () => defer ? new Promise<typeof profile>((done) => { resolve = done; }) : current,
  });
  await c.save({ name: 'Edit' }); await c.review();
  assert.equal(c.snapshot().latest, null); assert.equal(c.snapshot().conflict, true);
  current = { ...profile, revision: 0 }; await c.review(); assert.equal(c.snapshot().latest, null);
  defer = true; const reviewing = c.review(); c.dispose(); resolve({ ...profile, revision: 2 }); await reviewing;
  assert.equal(c.snapshot().latest, null); assert.equal(c.snapshot().failure, null);
});

test('definitive creation rejection permits a corrected draft and a new reservation', async () => {
  let reservations = 0;
  const c = createDealerEditor<{ name: string }, typeof profile>({ initial: null, key: () => String(++reservations), conflict: () => false, rejectedBeforeCreation: (error) => error === 'validation',
    get: async () => profile, update: async () => profile,
    create: async (input) => { if (!input.name) throw 'validation'; return { ...profile, name: input.name }; },
  });
  await c.save({ name: '' }); assert.equal(c.snapshot().uncertain, false);
  await c.save({ name: 'Corrected' }); assert.equal(c.snapshot().saved?.name, 'Corrected'); assert.equal(reservations, 2);
});
