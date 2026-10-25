import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const native = createRequire(mobile.resolve('react-native/package.json'));
const cli = createRequire(native.resolve('@react-native/community-cli-plugin/package.json'));
const metroRoot = dirname(cli.resolve('metro/package.json'));
const metro = createRequire(join(metroRoot, 'package.json'));
const { getAssetSize } = metro(join(metroRoot, 'src/Assets.js'));
const parserPath = metro.resolve('image-size');

function box(name, body = Buffer.alloc(0), size = 8 + body.length) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size);
  header.write(name, 4, 4, 'ascii');
  return Buffer.concat([header, body]);
}

const malformed = {
  icns: Buffer.concat([Buffer.from('icns'), Buffer.from([0, 0, 0, 16]), Buffer.from('icp4'), Buffer.alloc(4)]),
  jxl: Buffer.concat([box('JXL ', Buffer.from([13, 10, 135, 10])), box('ftyp', Buffer.from('jxl ')), box('jxlp', Buffer.alloc(4), 0)]),
  heif: Buffer.concat([box('ftyp', Buffer.from('heic')), box('meta', Buffer.alloc(4), 0)]),
};

for (const [format, input] of Object.entries(malformed)) {
  test(`installed parser rejects malformed ${format} without hanging`, () => {
    const result = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', `
      const api = require(process.argv[1]);
      const size = typeof api === 'function' ? api : api.imageSize;
      try { size(Buffer.from(process.argv[2], 'base64')); process.exitCode = 2; }
      catch { process.stdout.write('rejected'); }
    `, parserPath, input.toString('base64')], { encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL' });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, 'parser must reject rather than exhaust memory or crash');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'rejected');
  });
}

test('Metro reads real PNG and JPEG asset dimensions through its installed adapter', () => {
  for (const [path, type, width, height] of [
    ['../apps/mobile/assets/icon.png', 'png', 1024, 1024],
    ['./fixtures/showroom.jpg', 'jpg', 800, 600],
  ]) {
    const content = readFileSync(new URL(path, import.meta.url));
    assert.deepEqual(getAssetSize(type, content, path), { width, height });
  }
});
