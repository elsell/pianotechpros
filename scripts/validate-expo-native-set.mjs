import { inspectNavigationGraph } from './navigation-compatibility.mjs';
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
