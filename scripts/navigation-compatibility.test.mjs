import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNavigationGraph } from './navigation-compatibility.mjs';

function fixture() {
  return {
    '@react-navigation/native': { path: '/native', manifest: { version: '7.1.34' } },
    'expo-router': { nativePath: '/native', manifest: { version: '55.0.18', dependencies: { '@react-navigation/native': '^7.1.33', '@react-navigation/native-stack': '^7.14.5' } } },
    '@react-navigation/native-stack': { nativePath: '/native', manifest: { version: '7.14.5', peerDependencies: { '@react-navigation/native': '^7.1.33' } } },
  };
}
test('accepts compatible shared native contexts', () => assert.doesNotThrow(() => validateNavigationGraph(fixture())));
test('rejects override-hidden dependency and peer incompatibility', () => {
  const olderStack = fixture();
  olderStack['@react-navigation/native-stack'].manifest.version = '7.3.16';
  assert.throws(() => validateNavigationGraph(olderStack), /requires.*native-stack/);
  const newerPeer = fixture();
  newerPeer['@react-navigation/native-stack'].manifest.peerDependencies['@react-navigation/native'] = '^7.2.6';
  assert.throws(() => validateNavigationGraph(newerPeer), /requires.*native/);
});
test('rejects duplicate native contexts even with identical versions', () => {
  const graph = fixture();
  graph['expo-router'].nativePath = '/other/native';
  assert.throws(() => validateNavigationGraph(graph), /different navigation context/);
});
