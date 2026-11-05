// Fake Ulanzi Studio: a real WebSocket server that speaks the SDK's wire format.
// The plugin runs its vendored, unmodified SDK against it, so these tests check the SDK V3.1 event contract.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  ACTION_UUID,
  CurrentWallpaperController,
  PLUGIN_UUID,
  TITLES,
  wallpaperLabel,
} from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/controller.js';
import { HostConnection, silenceConsole } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/host.js';
import { WallpaperEngineCli } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-cli.js';

// ws is a runtime dependency of the plugin, installed in its own folder (npm ci --prefix).
const require = createRequire(new URL('../com.ulanzi.wallpaperenginepro.ulanziPlugin/package.json', import.meta.url));
const { WebSocketServer } = require('ws');

silenceConsole();

const EXE = String.raw`C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe`;
const SUNSET = String.raw`C:\Wallpapers\Sunset\project.json`;
const KEY = { key: 'k1', actionid: 'a1' };

async function until(check, label, ms = 2_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function fixture({ output = SUNSET, error = null, deferred = false, maxAttempts = 3 } = {}) {
  const execCalls = [];
  const pending = [];
  const execFileImpl = (file, args, options, done) => {
    execCalls.push({ file, args, options });
    const finish = () => done(error, output, '');
    if (deferred) pending.push(finish);
    else finish();
  };
  const logs = [];
  const received = [];
  const sockets = [];
  let gaveUp = false;

  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => received.push(JSON.parse(raw)));
  });

  const host = new HostConnection();
  const controller = new CurrentWallpaperController({
    host,
    createCli: (executablePath) => new WallpaperEngineCli({
      executablePath, platform: 'win32', execFileImpl, timeoutMs: 1_000,
    }),
    log: (message) => logs.push(message),
    onGiveUp: () => { gaveUp = true; },
    reconnectDelayMs: 20,
    maxAttempts,
  });
  controller.attach();
  host.connect(PLUGIN_UUID, server.address().port, '127.0.0.1');

  const send = (cmd, fields = {}) => sockets.at(-1).send(JSON.stringify({ cmd, ...fields }));
  const actionEvent = (cmd, param, extra = {}) => send(cmd, { uuid: ACTION_UUID, ...KEY, ...(param ? { param } : {}), ...extra });
  const titles = () => received.filter((m) => m.cmd === 'setTitle').map((m) => m.param.text);
  const sent = (cmd) => received.filter((m) => m.cmd === cmd);

  return {
    server, host, controller, execCalls, pending, logs, received, sockets, send, actionEvent, titles, sent,
    gaveUp: () => gaveUp,
    async close() {
      controller.stop();
      for (const socket of sockets) socket.terminate();
      host.websocket?.close();
      server.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}

test('registers with Studio as the plugin main service', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').find((m) => m.uuid === PLUGIN_UUID), 'connected');
});

test('shows the configuration state and never runs Wallpaper Engine without a path', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.unconfigured), 'configuration state');
  assert.equal(fx.execCalls.length, 0);
});

test('shows the primary wallpaper name, queried without -monitor and without a shell', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'wallpaper name');
  assert.equal(fx.execCalls.length, 1);
  assert.equal(fx.execCalls[0].file, EXE);
  assert.deepEqual(fx.execCalls[0].args, ['-control', 'getWallpaper']);
  assert.equal(fx.execCalls[0].options.shell, false);
});

test('does not poll: nothing is queried until a press', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(fx.execCalls.length, 1);
});

test('queries again on press (run) and ignores keydown', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');

  fx.actionEvent('keydown');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 1, 'keydown must not query');

  fx.actionEvent('run');
  await until(() => fx.execCalls.length === 2, 'press query');
});

test('shows an unavailable state when Wallpaper Engine fails, without leaking the path', async (t) => {
  const fx = await fixture({ error: new Error(String.raw`failed reading C:\Users\Secret\wallpaper64.exe`) });
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes(TITLES.unavailable), 'unavailable state');
  assert.ok(fx.logs.length > 0);
  for (const line of fx.logs) {
    assert.doesNotMatch(line, /Secret|wallpaper64|Steam/);
  }
});

test('ignores a press while a query is still running', async (t) => {
  const fx = await fixture({ deferred: true });
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.execCalls.length === 1, 'pending query');
  fx.actionEvent('run');
  fx.actionEvent('run');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 1);
  fx.pending.forEach((finish) => finish());
  await until(() => fx.titles().includes('Sunset'), 'deferred result');
});

test('saves a valid path from the inspector and rejects an invalid one', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.unconfigured), 'configuration state');

  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'save', executablePath: String.raw`C:\evil\tool.exe` } });
  const rejected = await until(() => fx.sent('sendToPropertyInspector').find((m) => m.payload?.ok === false), 'rejection');
  assert.match(rejected.payload.message, /wallpaper64\.exe/);
  assert.equal(fx.sent('setSettings').length, 0);

  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'save', executablePath: EXE } });
  const saved = await until(() => fx.sent('setSettings')[0], 'setSettings');
  assert.equal(saved.settings.executablePath, EXE);
  await until(() => fx.titles().includes('Sunset'), 'draw after save');
});

test('stops drawing a key that Studio cleared', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');

  fx.send('clear', { param: [{ uuid: ACTION_UUID, ...KEY }] });
  await new Promise((resolve) => setTimeout(resolve, 50));
  fx.actionEvent('run');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 1, 'a cleared key must not query');
});

test('reconnects when Studio drops the socket and draws its keys again', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');

  fx.sockets[0].terminate();
  await until(() => fx.sent('connected').length >= 2, 'second connected');
  await until(() => fx.execCalls.length === 2, 'redraw after reconnection');
  assert.equal(fx.gaveUp(), false);
});

test('stops retrying after the configured attempts when Studio is gone', async (t) => {
  const fx = await fixture({ maxAttempts: 2 });
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  for (const socket of fx.sockets) socket.terminate();
  fx.server.close();
  await until(() => fx.gaveUp(), 'give up', 3_000);
  assert.ok(fx.logs.some((line) => line.includes('no connection to Studio after 2 attempts')));
});

test('wallpaperLabel shows a name and never the folders above it', () => {
  assert.equal(wallpaperLabel(SUNSET), 'Sunset');
  assert.equal(wallpaperLabel(String.raw`D:\Private\Ocean.mp4`), 'Ocean');
  assert.equal(wallpaperLabel(''), 'Wallpaper');
  const long = wallpaperLabel('C:\\W\\' + 'x'.repeat(60) + '\\project.json');
  assert.equal(long.length, 24);
  assert.ok(long.endsWith('…'));
  assert.doesNotMatch(wallpaperLabel(String.raw`C:\Users\Secret\Sunset\project.json`), /Secret|Users/);
});

test('applies settings that arrive after the key, and ignores an echo of the same path', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.unconfigured), 'configuration state');

  fx.actionEvent('paramfromapp', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'query after settings');
  fx.actionEvent('paramfromplugin', { executablePath: EXE });
  fx.actionEvent('paramfromapp', { executablePath: EXE });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 1, 'the same path must not query again');
});

test('ignores events that belong to another action', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.send('add', { uuid: 'com.example.other.action', ...KEY, param: { executablePath: EXE } });
  fx.send('run', { uuid: 'com.example.other.action', ...KEY });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 0);
  assert.deepEqual(fx.titles(), []);
});

test('refreshes when the key becomes active again, not when it is hidden', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');

  fx.actionEvent('setactive', undefined, { active: false });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(fx.execCalls.length, 1, 'a hidden key must not query');

  fx.actionEvent('setactive', undefined, { active: 'true' });
  await until(() => fx.execCalls.length === 2, 'query when active');
});

test('tells the inspector the saved path, and an empty one for a key it does not know', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  await until(() => fx.sent('connected').length, 'connected');
  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'hello' } });
  const empty = await until(() => fx.sent('sendToPropertyInspector')[0], 'reply for an unknown key');
  assert.deepEqual(empty.payload, { type: 'settings', executablePath: '' });

  fx.actionEvent('add', { executablePath: EXE });
  await until(() => fx.titles().includes('Sunset'), 'first query');
  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'hello' } });
  const saved = await until(() => fx.sent('sendToPropertyInspector')[1], 'reply for a known key');
  assert.deepEqual(saved.payload, { type: 'settings', executablePath: EXE });
});

test('works with its default collaborators and survives a host error', async () => {
  const handlers = {};
  const titles = [];
  const listen = (name) => (fn) => { handlers[name] = fn; };
  const host = {
    onConnected: listen('connected'), onClose: listen('close'), onError: listen('error'), onAdd: listen('add'),
    onParamFromApp: listen('paramfromapp'), onParamFromPlugin: listen('paramfromplugin'), onRun: listen('run'),
    onSetActive: listen('setactive'), onSendToPlugin: listen('sendToPlugin'), onClear: listen('clear'),
    reconnect() {}, setTitle: (_context, text) => titles.push(text), setSettings() {}, sendToPropertyInspector() {},
  };
  const controller = new CurrentWallpaperController({ host });
  controller.attach();
  try {
    handlers.error(new Error('socket error'));
    // A path that cannot exist: the real adapter is built, and the query fails the way a stopped Wallpaper Engine does.
    handlers.add({ uuid: ACTION_UUID, context: 'c1', param: { executablePath: String.raw`C:\not-installed-anywhere\wallpaper64.exe` } });
    await until(() => titles.includes(TITLES.unavailable), 'unavailable state');
    handlers.connected();
  } finally {
    controller.stop();
  }
});
