import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const pluginRoot = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'manifest.json'), 'utf8'));

test('plugin UUID matches the folder and the action UUID extends it', () => {
  assert.equal(pluginRoot, manifest.UUID);
  assert.equal(manifest.Type, 'JavaScript');
  assert.equal(manifest.Actions.length, 1, 'Phase 1 ships a single action');
  assert.equal(manifest.Actions[0].UUID, `${manifest.UUID}.current-wallpaper`);
});

test('the action is a keypad action that does not add states on its own', () => {
  const [action] = manifest.Actions;
  assert.deepEqual(action.Controllers, ['Keypad']);
  assert.equal(action.DisableAutomaticStates, true);
  assert.equal(action.SupportedInMultiActions, false);
});

test('Windows is the only declared platform, matching the Wallpaper Engine CLI', () => {
  assert.deepEqual(manifest.OS.map((os) => os.Platform), ['windows']);
});

test('every file the manifest references exists', () => {
  const [action] = manifest.Actions;
  const references = [
    manifest.Icon,
    manifest.CategoryIcon,
    manifest.CodePath,
    action.Icon,
    action.PropertyInspectorPath,
    ...action.States.map((state) => state.Image),
  ];
  for (const reference of references) {
    assert.ok(existsSync(join(pluginRoot, reference)), `missing ${reference}`);
  }
});

test('every local script and stylesheet in the inspector resolves inside the plugin', () => {
  const page = join(pluginRoot, manifest.Actions[0].PropertyInspectorPath);
  const html = readFileSync(page, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((ref) => !ref.startsWith('http'));
  assert.ok(refs.length >= 6);
  for (const ref of refs) {
    assert.ok(existsSync(join(dirname(page), ref)), `inspector cannot load ${ref}`);
  }
});

test('inspector shows its configuration form without waiting for a websocket event', () => {
  const page = join(pluginRoot, manifest.Actions[0].PropertyInspectorPath);
  const html = readFileSync(page, 'utf8');
  // A previous version hid the whole form, but its script never removed the hidden class.
  // Keep the input visible even if Studio is still establishing the websocket connection.
  assert.match(html, /<div class="uspi-wrapper">/);
  assert.match(html, /<input[^>]*id="executablePath"[^>]*>/);
  assert.doesNotMatch(html, /<div class="uspi-wrapper hidden">/);
});


test('the plugin runtime pins ws to an exact version', () => {
  const runtime = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
  assert.match(runtime.dependencies.ws, /^\d+\.\d+\.\d+$/);
});
