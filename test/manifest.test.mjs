import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const pluginRoot = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
const manifest = JSON.parse(readFileSync(join(pluginRoot, 'manifest.json'), 'utf8'));

test('plugin UUID matches the folder and the action UUID extends it', () => {
  assert.equal(pluginRoot, manifest.UUID);
  assert.equal(manifest.Type, 'JavaScript');
  assert.deepEqual(manifest.Actions.map((action) => action.UUID), [
    `${manifest.UUID}.current-wallpaper`,
    `${manifest.UUID}.command`,
  ]);
});

test('every action is a keypad action that does not add states on its own', () => {
  for (const action of manifest.Actions) {
    assert.deepEqual(action.Controllers, ['Keypad']);
    assert.equal(action.DisableAutomaticStates, true);
    assert.equal(action.SupportedInMultiActions, false);
  }
});

test('no inspector asks for an executable path, a file or a folder', () => {
  for (const action of manifest.Actions) {
    const page = join(pluginRoot, action.PropertyInspectorPath);
    const html = readFileSync(page, 'utf8');
    const script = readFileSync(join(dirname(page), 'inspector.js'), 'utf8');
    assert.doesNotMatch(html, /executablePath|type="file"|wallpaper64/i, page);
    assert.doesNotMatch(script, /executablePath|selectFileDialog|selectFolderDialog/, page);
  }
});

test('every command offered by the command inspector is one the plugin knows', async () => {
  const { COMMANDS } = await import('../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/commands.js');
  const html = readFileSync(join(pluginRoot, manifest.Actions[1].PropertyInspectorPath), 'utf8');
  const offered = [...html.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered.sort(), Object.keys(COMMANDS).sort());
});

test('every command has its own key icon of the D200 size', async () => {
  const { COMMANDS } = await import('../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/commands.js');
  for (const { icon } of Object.values(COMMANDS)) {
    const png = readFileSync(join(pluginRoot, 'resources', 'commands', `${icon}.png`));
    assert.equal(png.toString('latin1', 1, 4), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [196, 196], icon);
  }
});

test('Windows is the only declared platform, matching the Wallpaper Engine CLI', () => {
  assert.deepEqual(manifest.OS.map((os) => os.Platform), ['windows']);
});

test('every file the manifest references exists', () => {
  const references = [
    manifest.Icon,
    manifest.CategoryIcon,
    manifest.CodePath,
    ...manifest.Actions.flatMap((action) => [action.Icon, action.PropertyInspectorPath, ...action.States.map((state) => state.Image)]),
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

test('auto-discovery inspector is visible and never asks for a manual executable path', () => {
  const page = join(pluginRoot, manifest.Actions[0].PropertyInspectorPath);
  const html = readFileSync(page, 'utf8');
  const script = readFileSync(join(dirname(page), 'inspector.js'), 'utf8');

  // Keep the status and retry button visible even before Studio establishes its WebSocket.
  assert.match(html, /<div class="uspi-wrapper">/);
  assert.doesNotMatch(html, /<div class="uspi-wrapper hidden">/);
  assert.match(html, /id="status"/);
  assert.match(html, /<button[^>]*id="retry"/);
  // Product requirement: finding wallpaper64.exe / wallpaper32.exe is fully automatic.
  assert.doesNotMatch(html, /id="executablePath"/);
  assert.doesNotMatch(script, /getElementById\(['"]executablePath['"]\)|querySelector\(['"]#executablePath['"]\)/);
});


test('the inspector is one vertical column that wraps, for Studio\'s narrow panel', () => {
  const page = join(pluginRoot, manifest.Actions[0].PropertyInspectorPath);
  const html = readFileSync(page, 'utf8');
  const css = readFileSync(join(dirname(page), 'inspector.css'), 'utf8');
  // The two-column uspi-item row is what squeezed the text next to its label.
  assert.doesNotMatch(html, /uspi-item-label/);
  assert.match(html, /class="panel"/);
  assert.match(css, /\.panel\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(html, /aria-live="polite"/);
});

test('the plugin runtime pins ws to an exact version', () => {
  const runtime = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
  assert.match(runtime.dependencies.ws, /^\d+\.\d+\.\d+$/);
});
