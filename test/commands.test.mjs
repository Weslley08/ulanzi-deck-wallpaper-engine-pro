import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMANDS, commandArgs, commandLabel, normalizeCommandSettings, normalizeMonitor, normalizeName } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/commands.js';
import { WallpaperEngineCli } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-cli.js';

test('only documented Wallpaper Engine commands are offered', () => {
  const documented = new Set(['nextWallpaper', 'pause', 'play', 'mute', 'unmute', 'openPlaylist', 'openProfile']);
  for (const spec of Object.values(COMMANDS)) assert.ok(documented.has(spec.control), spec.control);
});

test('settings from Studio are normalized, and unknown commands fall back to next', () => {
  assert.deepEqual(normalizeCommandSettings(undefined), { command: 'next', name: '', monitor: null });
  assert.deepEqual(normalizeCommandSettings({ command: 'rm -rf' }), { command: 'next', name: '', monitor: null });
  assert.deepEqual(normalizeCommandSettings({ command: 'toString' }), { command: 'next', name: '', monitor: null });
  // A name or monitor that the command does not take is dropped.
  assert.deepEqual(normalizeCommandSettings({ command: 'pause', name: 'x', monitor: 3 }), { command: 'pause', name: '', monitor: null });
  assert.deepEqual(normalizeCommandSettings({ command: 'profile', name: ' Work ', monitor: 3 }), { command: 'profile', name: 'Work', monitor: null });
  assert.deepEqual(normalizeCommandSettings({ command: 'playlist', name: 'Chill', monitor: '1' }), { command: 'playlist', name: 'Chill', monitor: 1 });
});

test('names with quotes or control characters, or too long, are refused', () => {
  assert.equal(normalizeName('Lo-fi & chill 2'), 'Lo-fi & chill 2');
  assert.equal(normalizeName('a"b'), '');
  assert.equal(normalizeName('a\nb'), '');
  assert.equal(normalizeName('x'.repeat(65)), '');
  assert.equal(normalizeName(42), '');
});

test('a monitor is a Wallpaper Engine index 0 to 31, or nothing', () => {
  assert.equal(normalizeMonitor(''), null);
  assert.equal(normalizeMonitor(0), 0);
  assert.equal(normalizeMonitor('31'), 31);
  assert.equal(normalizeMonitor(32), null);
  assert.equal(normalizeMonitor(-1), null);
  assert.equal(normalizeMonitor(1.5), null);
});

test('without a monitor, next and playlist send no -monitor, keeping their documented defaults', () => {
  assert.deepEqual(commandArgs({ command: 'next', name: '', monitor: null }), ['-control', 'nextWallpaper']);
  assert.deepEqual(commandArgs({ command: 'playlist', name: 'Chill', monitor: null }), ['-control', 'openPlaylist', '-playlist', 'Chill']);
  assert.deepEqual(commandArgs({ command: 'playlist', name: 'Chill', monitor: 0 }), ['-control', 'openPlaylist', '-playlist', 'Chill', '-monitor', '0']);
  assert.equal(commandArgs({ command: 'profile', name: '', monitor: null }), null);
  assert.equal(commandArgs({ command: 'nope', name: '', monitor: null }), null);
});

test('labels stay two short lines', () => {
  assert.equal(commandLabel({ command: 'next', name: '', monitor: 1 }), 'Próximo\nmonitor 1');
  assert.equal(commandLabel({ command: 'profile', name: 'A very long profile name', monitor: null }), 'Perfil\nA very lo…');
  assert.equal(commandLabel({ command: 'mute', name: '', monitor: null }), 'Mudo');
});

test('the adapter refuses anything outside the allowlist before starting a process', async () => {
  const calls = [];
  const cli = new WallpaperEngineCli({
    executablePath: String.raw`D:\WE\wallpaper64.exe`,
    platform: 'win32',
    execFileImpl: (_file, args, _options, done) => { calls.push(args); done(null, '', ''); },
  });
  const refused = [
    ['-control', 'openWallpaper', '-file', 'x'],
    ['-control', 'pause', '-file'],
    ['pause'],
    ['-control', 'pause', '-x', 'y'],
    'pause',
    ['-control', 'pause', '-monitor', 3],
  ];
  for (const bad of refused) {
    await assert.rejects(cli.sendCommand(/** @type {any} */ (bad)), (error) => error.reason === 'refused');
  }
  assert.equal(calls.length, 0);
  await cli.sendCommand(['-control', 'openPlaylist', '-playlist', 'Chill', '-monitor', '1']);
  assert.deepEqual(calls, [['-control', 'openPlaylist', '-playlist', 'Chill', '-monitor', '1']]);
});

test('command icons are the packaged PNGs, cached, and nothing outside resources/commands is read', async () => {
  const { commandIcon } = await import('../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/icons.js');
  const icon = commandIcon('pause');
  assert.match(icon ?? '', /^data:image\/png;base64,iVBORw0KGgo/);
  assert.equal(commandIcon('pause'), icon);
  assert.equal(commandIcon('../manifest'), null);
  assert.equal(commandIcon('missing'), null);
});

test('a failed command carries a reason safe for logs', async () => {
  const cli = new WallpaperEngineCli({
    executablePath: String.raw`D:\WE\wallpaper64.exe`,
    platform: 'win32',
    execFileImpl: (_file, _args, _options, done) => done(Object.assign(new Error('slow'), { killed: true }), '', ''),
  });
  await assert.rejects(cli.sendCommand(['-control', 'pause']), (error) => error.reason === 'timed out');
});
