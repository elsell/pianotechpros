import assert from 'node:assert/strict';
import test from 'node:test';
import { createDealerCreation } from './dealer-creation.js';

test('uncertain creation retries the original snapshot and key despite changed caller input', async () => {
  const stored = new Map<string, { name: string }>();
  let loseResponse = true;
  const command = createDealerCreation<{ name: string }, { id: string }>({
    key: () => 'stable-key',
    rejectedBeforeCreation: (error) => error === 'validation',
    create: async (profile, key) => {
      if (!stored.has(key)) stored.set(key, { ...profile });
      if (loseResponse) { loseResponse = false; throw 'network'; }
      assert.deepEqual(profile, stored.get(key));
      return { id: key };
    },
  });
  const profile = { name: 'Original' };
  await assert.rejects(command.submit(profile));
  profile.name = 'Changed';
  assert.equal(command.pending(), true);
  assert.deepEqual(await command.submit(profile), { id: 'stable-key' });
  assert.deepEqual([...stored.values()], [{ name: 'Original' }]);
  assert.equal(command.pending(), false);
});

test('definitive validation rejection permits a corrected intent and concurrent submits coalesce', async () => {
  let keys = 0; let calls = 0;
  const command = createDealerCreation<{ name: string }, string>({
    key: () => String(++keys), rejectedBeforeCreation: (error) => error === 'validation',
    create: async (profile, key) => { calls++; if (!profile.name) throw 'validation'; return key; },
  });
  await assert.rejects(command.submit({ name: '' }));
  assert.equal(command.pending(), false);
  const first = command.submit({ name: 'Shop' }); const second = command.submit({ name: 'Ignored' });
  assert.equal(await first, '2'); assert.equal(await second, '2'); assert.equal(calls, 2);
});
