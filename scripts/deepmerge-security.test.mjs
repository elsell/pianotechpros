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
const poison = () => JSON.parse('{"__proto__":{"injected":true},"constructor":{"prototype":{"injected":true}},"prototype":{"injected":true}}');
function safe(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.injected, undefined);
  for (const key of ['__proto__', 'constructor', 'prototype']) assert.equal(Object.hasOwn(value, key), false);
  assert.equal(({}).injected, undefined);
}

for (const [name, consumer] of consumers) {
  const merge = consumer('@fastify/deepmerge')({ symbols: true });
  test(`${name} merge rejects prototype keys for every affected target shape`, () => {
    safe(merge(Object.create(null), poison()));
    safe(merge(poison(), { retained: true }));
    for (const placeholder of [null, undefined, 0, false, '']) {
      safe(merge({ nested: placeholder }, { nested: poison() }).nested);
    }
    safe(merge({ items: [] }, { items: [poison()] }).items[0]);
    safe(merge({ nested: null }, { nested: JSON.parse('{"constructor":{"prototype":{"injected":true}},"prototype":{"injected":true}}') }).nested);
  });
  test(`${name} merge retains legitimate configuration and options`, () => {
    const symbol = Symbol('fixture');
    const original = { nested: { first: 1 }, items: [1], [symbol]: { first: true } };
    const result = merge(original, { nested: { second: 2 }, items: [2], [symbol]: { second: true } });
    assert.deepEqual(result.nested, { first: 1, second: 2 });
    assert.deepEqual(result.items, [1, 2]);
    assert.deepEqual(result[symbol], { first: true, second: true });
    assert.deepEqual(original.items, [1]);
    const date = new Date('2020-01-01T00:00:00Z');
    const regex = /piano/gi;
    const transform = () => 'piano';
    const special = merge({}, { date, regex, transform });
    assert.deepEqual(special.date, date);
    assert.deepEqual(special.regex, regex);
    assert.equal(special.transform, transform);
  });
}

for (const [name, consumer] of [['Expo', config], ['EAS', easConfig]]) {
  test(`${name} config modifications preserve valid fields without inherited injection`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'piano-merge-config-'));
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'piano-fixture', version: '1.0.0' }));
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: {
        name: 'Piano Fixture', slug: 'piano-fixture', sdkVersion: '55.0.0', extra: { nested: null, retained: true, items: [1] },
        plugins: [['./plugin.cjs', { nested: { first: true }, items: [1] }]],
      } }));
      writeFileSync(join(root, 'plugin.cjs'), 'module.exports = config => config;');
      const result = await consumer('./build/Config.js').modifyConfigAsync(root,
        { extra: { nested: poison(), added: true, items: [2] }, plugins: [['./plugin.cjs', { nested: { second: true }, items: [2] }]] }, {}, { dryRun: true });
      assert.equal(result.type, 'success');
      assert.equal(result.config.name, 'Piano Fixture');
      assert.equal(result.config.extra.retained, true);
      assert.equal(result.config.extra.added, true);
      safe(result.config.extra.nested);
      assert.deepEqual(result.config.extra.items, [1, 2]);
      assert.deepEqual(result.config.plugins, [['./plugin.cjs', { nested: { first: true, second: true }, items: [1, 2] }]]);
      assert.deepEqual(JSON.parse(readFileSync(join(root, 'app.json'))).expo.extra.items, [1]);
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

test('Svelte merges real config with inline array replacement and callable preprocessors', async () => {
  const { preResolveOptions } = await import(pathToFileURL(join(dirname(svelteEntry), 'utils/options.js')).href);
  const root = mkdtempSync(join(tmpdir(), 'piano-svelte-merge-'));
  const markup = async ({ content }) => ({ code: content.toUpperCase() });
  try {
    writeFileSync(join(root, 'svelte.config.js'), 'module.exports = { extensions: [".svelte"], compilerOptions: { immutable: true }, preprocess: [{ name: "file" }] };');
    const inline = { extensions: ['.html'], preprocess: [{ name: 'inline', markup }] };
    const result = await preResolveOptions(inline, { root }, { command: 'build', mode: 'production' });
    assert.deepEqual(result.extensions, ['.html']);
    assert.equal(result.compilerOptions.immutable, true);
    assert.equal(result.preprocess.length, 1);
    assert.equal(result.preprocess[0].name, 'inline');
    assert.equal(result.preprocess[0].markup, markup);
    assert.deepEqual(await result.preprocess[0].markup({ content: 'piano' }), { code: 'PIANO' });
    assert.deepEqual(inline.extensions, ['.html']);
    const hostile = { preprocess: [{ name: 'hostile', ...poison(), nested: poison() }] };
    const guarded = await preResolveOptions(hostile, { root }, { command: 'build', mode: 'production' });
    safe(guarded.preprocess[0]);
    safe(guarded.preprocess[0].nested);
    assert.equal(Object.hasOwn(hostile.preprocess[0], '__proto__'), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('all consumers use the reviewed replacement and no vulnerable dependency remains', () => {
  const manifest = JSON.parse(readFileSync(new URL('../patches/deepmerge.json', import.meta.url)));
  const sha = data => createHash('sha256').update(data).digest('hex');
  const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  for (const [file, hash] of Object.entries(manifest.patches)) {
    const key = file === 'expo-config-deepmerge.patch' ? '@expo/config@55.0.21' : '@sveltejs/vite-plugin-svelte@7.1.2';
    assert.ok(lock.includes(`  '${key}': ${hash}\n`), `${file} patch hash does not match its lockfile entry`);
    assert.equal(sha(readFileSync(new URL(`../patches/${file}`, import.meta.url))), hash);
  }
  for (const [name, consumer] of consumers) {
    const source = name === 'Svelte' ? join(dirname(svelteEntry), 'utils/options.js') : consumer.resolve('./build/Config.js');
    assert.equal(sha(readFileSync(source)), manifest.consumers[name === 'Svelte' ? 'svelte' : 'expo'].sha256);
    const root = dirname(consumer.resolve('@fastify/deepmerge/package.json'));
    assert.equal(consumer('@fastify/deepmerge/package.json').version, '3.2.2');
    for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(join(root, file))), hash, file);
  }
  assert.doesNotMatch(lock, /^  ['"]?deepmerge@/m);
  assert.ok(lock.includes(manifest.integrity));
});
