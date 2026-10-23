import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function checkScreensBackport() {
  const manifest = JSON.parse(await readFile(new URL('../patches/react-native-screens.json', import.meta.url)));
  const root = new URL('../apps/mobile/node_modules/react-native-screens/', import.meta.url);
  const installed = JSON.parse(await readFile(new URL('package.json', root)));
  assert.equal(installed.version, manifest.version, 'review or retire the mounting-listener backport when upgrading screens');
  const patch = await readFile(new URL(`../patches/react-native-screens@${manifest.version}.patch`, import.meta.url));
  assert.equal(digest(patch), manifest.patchSHA256, 'screens backport differs from reviewed patch');
  for (const [path, expected] of Object.entries(manifest.files)) {
    assert.equal(digest(await readFile(new URL(path, root))), expected, `screens backport missing or modified: ${path}`);
  }
}
