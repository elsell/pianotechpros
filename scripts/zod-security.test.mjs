import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';

const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const expo = createRequire(mobile.resolve('expo/package.json'));
const cli = createRequire(expo.resolve('@expo/cli/package.json'));
const tools = createRequire(new URL('../tools/eas-cli/package.json', import.meta.url));
const eas = createRequire(tools.resolve('eas-cli/package.json'));
const job = createRequire(eas.resolve('@expo/eas-build-job/package.json'));
for (const [name, consumer] of [['Expo CLI', cli], ['EAS CLI', eas], ['EAS job', job]]) {
  test(`${name} rejects oversized arrays and sets before visiting elements`, () => {
    const { z } = consumer('zod');
    for (const kind of ['array', 'set']) {
      let visits = 0;
      const element = z.number().superRefine(() => { visits++; });
      const schema = (kind === 'array' ? z.array(element) : z.set(element)).max(2);
      const input = values => kind === 'array' ? values : new Set(values);
      const result = schema.safeParse(input([1, 2, 3]));
      assert.equal(result.success, false);
      assert.equal(visits, 0);
      assert.equal(result.error.issues.length, 1);
      assert.equal(result.error.issues[0].code, 'too_big');
      assert.equal(schema.safeParse(input([1, 2])).success, true);
      assert.equal(visits, 2);
      assert.equal(schema.safeParse(input(['invalid'])).success, false);
    }
  });
}

const server = join(dirname(expo.resolve('@expo/cli/package.json')), 'build/src/start/server');
const { PluginSchema, DevToolsPluginOutputSchema } = cli(join(server, 'DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = cli(join(server, 'createMCPDevToolsExtensionSchema.js'));
test('Expo plugin, output and command schemas retain their actual validation behavior', () => {
  const plugin = { packageName: 'fixture', packageRoot: '/fixture', cliExtensions: {
    description: 'fixture', entryPoint: './index.js', commands: [{ name: 'inspect', title: 'Inspect', environments: ['mcp'], parameters: [{ name: 'count', type: 'number' }] }],
  } };
  assert.equal(PluginSchema.safeParse(plugin).success, true);
  assert.equal(PluginSchema.safeParse({ ...plugin, packageName: '' }).success, false);
  const command = createMCPDevToolsExtensionSchema(plugin);
  assert.equal(command.safeParse({ command: 'inspect', count: 2 }).success, true);
  for (const value of [{ command: 'unknown' }, { command: 'inspect', count: 'two' }, { command: 'inspect', unexpected: true }]) {
    assert.equal(command.safeParse(value).success, false);
  }
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'result', level: 'info' }]).success, true);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'image', url: 'not-a-url' }]).success, false);
});

test('EAS archive schema validates its discriminated source contract', () => {
  const { ArchiveSourceSchemaZ } = eas('@expo/eas-build-job');
  assert.equal(ArchiveSourceSchemaZ.safeParse({ type: 'URL', url: 'https://example.com/archive.tgz' }).success, true);
  for (const value of [{ type: 'URL', url: 'invalid' }, { type: 'PATH' }, { type: 'unknown' }]) {
    assert.equal(ArchiveSourceSchemaZ.safeParse(value).success, false);
  }
});
