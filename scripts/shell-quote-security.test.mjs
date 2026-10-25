import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const native = createRequire(mobile.resolve('react-native/package.json'));
const devtools = createRequire(native.resolve('react-devtools-core/package.json'));
const { quote, parse } = devtools('shell-quote');

test('devtools quote rejects line terminators after a comment without generating shell input', () => {
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote(['echo', 'ok', { comment: 'fixture' }, `a${separator}unexpected-command;#`]), TypeError);
  }
});

test('ordinary quoted arguments still round trip through the actual devtools dependency', () => {
  const args = ['echo', 'two words', 'single\'quote', '$literal', 'semi;colon', ''];
  assert.deepEqual(parse(quote(args)), args);
  assert.equal(quote(['echo', 'ok', { comment: 'fixture' }]), 'echo ok #fixture');
});
