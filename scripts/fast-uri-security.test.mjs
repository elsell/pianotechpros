import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const tools = createRequire(new URL('../tools/eas-cli/package.json', import.meta.url));
const eas = createRequire(tools.resolve('eas-cli/package.json'));
const ajvRequire = createRequire(eas.resolve('ajv/package.json'));
const uri = ajvRequire('fast-uri');

test('encoded scheme tokens never normalize into an active scheme', () => {
  for (const encoded of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    assert.notEqual(uri.parse(encoded).scheme, 'javascript');
    assert.ok(!uri.normalize(encoded).startsWith('javascript:'));
    assert.ok(uri.parse(encoded).error);
    assert.throws(() => uri.resolve('https://example.com/base/', encoded), /malformed/);
  }
  assert.equal(uri.equal('%68ttp://example.com/', 'http://example.com/'), false);
});

test('ambiguous HTTP authorities are rejected instead of silently rewritten', () => {
  for (const input of ['http://a@b@evil.example/', ...['\t', '\r', '\n'].map(c => `https://exa${c}mple.com/`)]) {
    assert.ok(uri.parse(input).error, JSON.stringify(input));
  }
  assert.equal(uri.parse('https://example.com/path').error, undefined);
});

test('normalization preserves relative reference resolution', () => {
  const base = 'https://example.com/catalog/stock/';
  for (const ref of ['a/../b', '../x', '../../piano', './new']) {
    assert.equal(uri.resolve(base, uri.normalize(ref)), uri.resolve(base, ref), ref);
  }
  assert.equal(uri.equal('../x', 'x'), false);
  assert.equal(uri.equal('a/../b', '/b'), false);
});

test('suffix serialization does not create a scheme-bearing reference', () => {
  for (const input of ['javascript:alert(1)', 'data:text/plain,fixture', 'vbscript:fixture']) {
    for (const skipEscape of [false, true]) {
      const relative = uri.serialize({ scheme: 'fixture', path: input }, { reference: 'suffix', skipEscape });
      assert.equal(uri.parse(relative).scheme, undefined);
    }
  }
});

test('EAS AJV retains legitimate local and relative schema references', () => {
  const Ajv = eas('ajv');
  const ajv = new Ajv();
  ajv.addSchema({ $id: 'https://example.com/schemas/name.json', type: 'string', minLength: 1 });
  const validate = ajv.compile({ $id: 'https://example.com/schemas/piano.json', type: 'object', required: ['name'], properties: { name: { $ref: './name.json' }, count: { $ref: '#/$defs/count' } }, $defs: { count: { type: 'integer', minimum: 0 } }, additionalProperties: false });
  assert.equal(validate({ name: 'Grand', count: 1 }), true);
  for (const input of [{ name: '' }, { name: 'Grand', count: -1 }, { count: 1 }]) assert.equal(validate(input), false);
});
