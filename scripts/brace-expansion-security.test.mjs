import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const tools = createRequire(new URL('../tools/eas-cli/package.json', import.meta.url));
const eas = createRequire(tools.resolve('eas-cli/package.json'));
const legacy = eas('minimatch');
const legacyRequire = createRequire(eas.resolve('minimatch/package.json'));
const expand = legacyRequire('brace-expansion');
const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expo = createRequire(mobile.resolve('expo/package.json'));
const cli = createRequire(expo.resolve('@expo/cli/package.json'));
const glob = createRequire(cli.resolve('glob/package.json'));
const modern = glob('minimatch').minimatch;

test('legacy and modern installed tooling retain brace matching behavior', () => {
  for (const match of [legacy, modern]) {
    assert.equal(match('src/a.ts', 'src/{a,b}.ts'), true);
    assert.equal(match('src/c.ts', 'src/{a,b}.ts'), false);
  }
  assert.equal(expand.expand, expand);
  assert.deepEqual(expand('a{b,c}'), ['ab', 'ac']);
});

test('bounded nesting retains literal input rather than recursively expanding it', () => {
  const result = expand('{{{{{a,b}}}}}', { maxDepth: 1 });
  assert.equal(result.length, 1);
  assert.ok(result[0].includes('a,b'));
});
