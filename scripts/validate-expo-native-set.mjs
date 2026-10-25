import { inspectNavigationGraph } from './navigation-compatibility.mjs';
import { checkScreensBackport } from './check-screens-backport.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = JSON.parse(await readFile(new URL('../apps/mobile/package.json', import.meta.url)));
const bundled = JSON.parse(await readFile(new URL('../apps/mobile/node_modules/expo/bundledNativeModules.json', import.meta.url)));
assert.deepEqual(app.expo?.install?.exclude, ['react-native'], 'only the documented React Native metadata exception is allowed');
assert.equal(app.dependencies['react-native'], bundled['react-native'], 'React Native must match Expo bundledNativeModules.json exactly');
console.log(`React Native ${app.dependencies['react-native']} matches the installed Expo native manifest`);

const graph = inspectNavigationGraph();
const workspace = await readFile(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');
const pin = workspace.match(/^  '@react-navigation\/native': '(\d+\.\d+\.\d+)'$/m)?.[1];
assert.ok(pin, 'navigation must retain an exact workspace override');
assert.equal(graph['@react-navigation/native'].manifest.version, pin, 'installed navigation must equal the exact override');
assert.equal(app.dependencies['@react-navigation/native'], graph['expo-router'].manifest.dependencies['@react-navigation/native'], 'direct range must match Router doctor metadata');
console.log("Navigation dependencies and shared contexts satisfy installed manifest requirements");

for (const name of ['expo-image-picker', 'expo-image-manipulator', 'expo-file-system', 'expo-audio', 'expo-asset']) {
  const pin = app.dependencies[name];
  assert.match(pin, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly`);
  assert.equal(bundled[name], `~${pin}`, `${name} must match the reviewed Expo native set`);
  const installed = JSON.parse(await readFile(new URL(`../apps/mobile/node_modules/${name}/package.json`, import.meta.url)));
  assert.equal(installed.version, pin, `${name} installed version must equal its pin`);
}
console.log('Native photo and audio modules match pinned Expo versions');
await checkScreensBackport();
console.log('Native screens mounting-listener backport matches reviewed source');
