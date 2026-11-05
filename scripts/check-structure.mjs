import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  'README.md','CLAUDE.md','CONTRIBUTING.md','SECURITY.md','LICENSE',
  'docs/PHASE-1.md','docs/BENCHMARK.md','docs/VERIFY.md','docs/API-SOURCES.md',
  'com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-cli.js',
  'test/wallpaper-engine-cli.test.mjs',
];
for (const file of files) assert.ok(existsSync(file), `Missing ${file}`);
const pkg = JSON.parse(readFileSync('package.json','utf8'));
assert.equal(pkg.type, 'module');
assert.equal(pkg.private, true);
assert.equal(pkg.license, 'Apache-2.0');
assert.equal(pkg.engines.node, '>=20.12.2 <21');
const pluginRoot = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
for (const file of [
  'manifest.json', 'package.json', 'plugin/app.js', 'plugin/controller.js', 'plugin/host.js',
  'plugin/settings.js', 'plugin/wallpaper-engine-cli.js', 'plugin/ulanzi-api/index.js', 'libs/js/ulanziApi.js',
  'property-inspector/current-wallpaper/inspector.html',
]) {
  assert.ok(existsSync(join(pluginRoot, file)), `Missing ${file}`);
}
assert.ok(existsSync('sdk-lock.json'), 'Missing sdk-lock.json');
console.log('Phase 0 scaffold and documented API adapter: OK');
