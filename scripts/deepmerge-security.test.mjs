import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expo = createRequire(mobile.resolve('expo/package.json'));
const config = createRequire(expo.resolve('@expo/config/package.json'));
const tooling = createRequire(new URL('../tools/eas-cli/package.json', import.meta.url));
const eas = createRequire(tooling.resolve('eas-cli/package.json'));
const easConfig = createRequire(eas.resolve('@expo/config/package.json'));
const web = createRequire(new URL('../apps/web/package.json', import.meta.url));
const svelteEntry = web.resolve('@sveltejs/vite-plugin-svelte');
const svelte = createRequire(svelteEntry);
const consumers = [['Expo', config], ['EAS', easConfig], ['Svelte', svelte]];
const poison = () => JSON.parse('{"__proto__":{"injected":true}}');
function safe(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.injected, undefined);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(({}).injected, undefined);
}

for (const [name, consumer] of consumers) {
  const merge = consumer('deepmerge');
  test(`${name} merge rejects prototype keys for every affected target shape`, () => {
    safe(merge(Object.create(null), poison()));
    safe(merge(poison(), { retained: true }));
    for (const placeholder of [null, undefined, 0, false, '']) {
      safe(merge({ nested: placeholder }, { nested: poison() }).nested);
    }
    safe(merge({ items: [] }, { items: [poison()] }).items[0]);
    safe(merge.all([poison(), { retained: true }]));
  });
  test(`${name} merge retains legitimate configuration and options`, () => {
    const symbol = Symbol('fixture');
    const original = { nested: { first: 1 }, items: [1], [symbol]: { first: true } };
    const result = merge(original, { nested: { second: 2 }, items: [2], [symbol]: { second: true } });
    assert.deepEqual(result.nested, { first: 1, second: 2 });
    assert.deepEqual(result.items, [1, 2]);
    assert.deepEqual(result[symbol], { first: true, second: true });
    assert.deepEqual(original.items, [1]);
    assert.deepEqual(merge({ items: [1] }, { items: [2] }, { arrayMerge: (_, source) => source }).items, [2]);
    const custom = merge({ nested: { first: 1 } }, { nested: { second: 2 } }, {
      customMerge: key => key === 'nested' ? (a, b) => ({ sum: a.first + b.second }) : undefined,
    });
    assert.deepEqual(custom.nested, { sum: 3 });
  });
}

for (const [name, consumer] of [['Expo', config], ['EAS', easConfig]]) {
  test(`${name} config modifications preserve valid fields without inherited injection`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'piano-merge-config-'));
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'piano-fixture', version: '1.0.0' }));
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: {
        name: 'Piano Fixture', slug: 'piano-fixture', sdkVersion: '55.0.0', extra: { nested: null, retained: true },
      } }));
      const result = await consumer('./build/Config.js').modifyConfigAsync(root,
        { extra: { nested: poison(), added: true } }, {}, { dryRun: true });
      assert.equal(result.type, 'success');
      assert.equal(result.config.name, 'Piano Fixture');
      assert.equal(result.config.extra.retained, true);
      assert.equal(result.config.extra.added, true);
      safe(result.config.extra.nested);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('Svelte option resolution retains compiler and array behavior', async () => {
  const { resolveOptions } = await import(pathToFileURL(join(dirname(svelteEntry), 'utils/options.js')).href);
  const result = resolveOptions({ emitCss: true, isBuild: true, extensions: ['.svelte'],
    compilerOptions: { immutable: true } }, { root: '/synthetic', isProduction: true, plugins: [] });
  assert.equal(result.compilerOptions.css, 'external');
  assert.equal(result.compilerOptions.dev, false);
  assert.equal(result.compilerOptions.immutable, true);
  assert.deepEqual(result.extensions, ['.svelte']);
});

test('all consumers and distributed entrypoints use the reviewed guard', () => {
  const manifest = JSON.parse(readFileSync(new URL('../patches/deepmerge.json', import.meta.url)));
  const sha = data => createHash('sha256').update(data).digest('hex');
  assert.equal(sha(readFileSync(new URL('../patches/deepmerge@4.3.1.patch', import.meta.url))), manifest.patchSHA256);
  for (const [, consumer] of consumers) {
    const root = dirname(consumer.resolve('deepmerge/package.json'));
    for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(join(root, file))), hash, file);
    const umd = consumer(join(root, 'dist/umd.js'));
    safe(umd(Object.create(null), poison()));
    safe(umd(poison(), {}));
  }
});
