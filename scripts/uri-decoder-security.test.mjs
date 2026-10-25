import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const navigation = createRequire(mobile.resolve('@react-navigation/native/package.json'));
const core = createRequire(navigation.resolve('@react-navigation/core/package.json'));
const queryPath = core.resolve('query-string');
const query = core('query-string');

test('navigation queries preserve Unicode, plus, duplicate keys and malformed bytes', () => {
  assert.deepEqual({ ...query.parse('title=%F0%9F%8E%B9+grand%2B&tag=a&tag=b&bad=%A0&empty=') }, {
    title: '🎹 grand+', tag: ['a', 'b'], bad: '%A0', empty: '',
  });
  assert.equal(query.parse('bad=%E0%A4%A').bad, '%E0%A4%A');
});

test('navigation query parsing terminates for a long malformed encoded value', () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', `
    const assert = require('node:assert/strict');
    const query = require(process.argv[1]);
    const malformed = '%A0'.repeat(10000);
    const parsed = query.parse('value=' + malformed + '&title=%F0%9F%8E%B9');
    assert.equal(parsed.value, malformed);
    assert.equal(parsed.title, '🎹');
    process.stdout.write('parsed');
  `, queryPath], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, 'parser must neither exhaust memory nor crash');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'parsed');
});


test('installed decoder matches the reviewed packaging-only patch', () => {
  const manifest = JSON.parse(readFileSync(new URL('../patches/decode-uri-component.json', import.meta.url)));
  const sha = (data) => createHash('sha256').update(data).digest('hex');
  assert.equal(sha(readFileSync(new URL('../patches/decode-uri-component@0.5.0.patch', import.meta.url))), manifest.patchSHA256);
  const queryRequire = createRequire(queryPath);
  const root = dirname(queryRequire.resolve('decode-uri-component'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    assert.equal(sha(readFileSync(join(root, file))), expected, file);
  }
});
