import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';

const appRequire = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const routerPath = appRequire.resolve('expo-router/package.json');
const routerRequire = createRequire(routerPath);
const semver = routerRequire('semver');

export function validateNavigationGraph(graph) {
  const native = graph['@react-navigation/native'];
  assert.ok(native, 'navigation native manifest is required');
  for (const [name, entry] of Object.entries(graph)) {
    for (const declarations of [entry.manifest.dependencies, entry.manifest.peerDependencies]) {
      for (const [dependency, range] of Object.entries(declarations ?? {})) {
        if (!graph[dependency]) continue;
        assert.ok(semver.satisfies(graph[dependency].manifest.version, range),
          `${name} requires ${dependency} ${range}; found ${graph[dependency].manifest.version}`);
      }
    }
    if (entry.nativePath) assert.equal(entry.nativePath, native.path,
      `${name} resolves a different navigation context`);
  }
}

export function inspectNavigationGraph() {
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const graph = {};
  const queue = [routerPath, appRequire.resolve('@react-navigation/native/package.json')];
  while (queue.length) {
    const path = realpathSync(queue.shift());
    const manifest = read(path);
    if (graph[manifest.name]) {
      assert.equal(graph[manifest.name].path, path, `${manifest.name} resolves multiple module instances`);
      continue;
    }
    const localRequire = createRequire(path);
    const declaresNative = manifest.dependencies?.['@react-navigation/native'] || manifest.peerDependencies?.['@react-navigation/native'];
    graph[manifest.name] = { manifest, path,
      nativePath: declaresNative ? realpathSync(localRequire.resolve('@react-navigation/native/package.json')) : undefined };
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (dependency.startsWith('@react-navigation/')) queue.push(localRequire.resolve(`${dependency}/package.json`));
    }
  }
  validateNavigationGraph(graph);
  return graph;
}
