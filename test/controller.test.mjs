// Fake Ulanzi Studio: a real WebSocket server that speaks the SDK's wire format.
// The plugin runs its vendored, unmodified SDK against it, so these tests check the SDK V3.1 event contract.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  ACTION_UUID,
  COMMAND_UUID,
  CurrentWallpaperController,
  PLUGIN_UUID,
  STATES,
  TITLES,
  wallpaperLabel,
} from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/controller.js';
import { HostConnection, silenceConsole } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/host.js';
import { WallpaperEngineCli } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-cli.js';

// ws is a runtime dependency of the plugin, installed in its own folder (npm run setup).
const require = createRequire(new URL('../com.ulanzi.wallpaperenginepro.ulanziPlugin/package.json', import.meta.url));
const { WebSocketServer } = require('ws');

silenceConsole();

const ON_D = String.raw`D:\SteamLibrary\steamapps\common\wallpaper_engine\wallpaper64.exe`;
const ON_E = String.raw`E:\Games\wallpaper_engine\wallpaper64.exe`;
const FOUND_D = { status: 'found', executablePath: ON_D };
const FOUND_E = { status: 'found', executablePath: ON_E };
const NOT_RUNNING = { status: 'not-running' };
const UNKNOWN = { status: 'unknown', reason: 'more than one installation is running' };
const SUNSET = String.raw`C:\Wallpapers\Sunset\project.json`;
const KEY = { key: 'k1', actionid: 'a1' };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label, ms = 2_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await pause(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** `found` is what each discovery returns in turn; the last one repeats. */
async function fixture({ found = [FOUND_D], output = SUNSET, error = null, deferred = false, maxAttempts = 3 } = {}) {
  const execCalls = [];
  const pending = [];
  let discoveries = 0;
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
    discovery: { discover: async () => found[Math.min(discoveries++, found.length - 1)] },
    createCli: (executablePath) => new WallpaperEngineCli({ executablePath, platform: 'win32', execFileImpl, timeoutMs: 1_000 }),
    icons: (name) => `data:image/png;base64,${name}`,
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
  /** A Wallpaper Command key: `key` tells the six positions apart. */
  const commandEvent = (cmd, key, param, extra = {}) => send(cmd, { uuid: COMMAND_UUID, key, actionid: `cmd-${key}`, ...(param ? { param } : {}), ...extra });
  const faces = (key) => sent('state').map((m) => m.param.statelist[0]).filter((face) => face.key === key);
  const alerts = (key) => sent('showAlert').filter((m) => m.key === key).length;

  await until(() => sent('connected').length, 'connected');
  return {
    server, execCalls, pending, logs, sockets, send, actionEvent, titles, sent, commandEvent, faces, alerts,
    discoveries: () => discoveries,
    gaveUp: () => gaveUp,
    async close() {
      controller.stop();
      for (const socket of sockets) socket.terminate();
      host.websocket?.close();
      server.close();
      await pause(10);
    },
  };
}

test('registers with Studio as the plugin main service', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  assert.ok(fx.sent('connected').find((m) => m.uuid === PLUGIN_UUID));
});

test('finds Wallpaper Engine by itself and shows the primary wallpaper, without -monitor or a shell', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'wallpaper name');
  assert.equal(fx.execCalls.length, 1);
  assert.equal(fx.execCalls[0].file, ON_D);
  assert.deepEqual(fx.execCalls[0].args, ['-control', 'getWallpaper']);
  assert.equal(fx.execCalls[0].options.shell, false);
});

test('ignores a path saved by an older build and uses only the discovered one', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', { executablePath: String.raw`C:\evil\wallpaper64.exe` });
  await until(() => fx.titles().includes('Sunset'), 'wallpaper name');
  assert.equal(fx.execCalls[0].file, ON_D);
  assert.equal(fx.sent('setSettings').length, 0, 'nothing is ever saved');
});

test('says Wallpaper Engine is not running, and never starts it', async (t) => {
  const fx = await fixture({ found: [NOT_RUNNING] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.notRunning), 'not running state');
  assert.equal(fx.execCalls.length, 0);
});

test('says it could not detect Wallpaper Engine when discovery is inconclusive', async (t) => {
  const fx = await fixture({ found: [UNKNOWN] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.undetected), 'undetected state');
  assert.equal(fx.execCalls.length, 0);
  assert.ok(fx.logs.some((line) => line === 'Wallpaper Engine detection inconclusive: more than one installation is running'));
});

test('recovers on the next press once Wallpaper Engine starts', async (t) => {
  const fx = await fixture({ found: [NOT_RUNNING, FOUND_D] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.notRunning), 'not running state');
  fx.actionEvent('run');
  await until(() => fx.titles().includes('Sunset'), 'recovered');
});

test('follows Wallpaper Engine when it restarts from another drive', async (t) => {
  const fx = await fixture({ found: [FOUND_D, FOUND_E] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.execCalls.length === 1, 'first query');
  fx.actionEvent('run');
  await until(() => fx.execCalls.length === 2, 'second query');
  assert.equal(fx.execCalls[1].file, ON_E);
});

test('a discovery that throws is shown as undetected, not as a crash', async (t) => {
  const fx = await fixture({ found: [null] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.undetected), 'undetected state');
});

test('says it could not read the wallpaper when the query fails, logging only the reason', async (t) => {
  const fx = await fixture({ error: Object.assign(new Error(String.raw`failed reading C:\Users\Secret\wallpaper64.exe`), { code: 3 }) });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.queryFailed), 'query failed state');
  assert.ok(fx.logs.includes('Wallpaper Engine query failed: exit code 3'));
  for (const line of fx.logs) assert.doesNotMatch(line, /Secret|wallpaper64|Steam|[A-Z]:\\/);
});

test('an empty answer from getWallpaper shows the program as detected, not as an error', async (t) => {
  const fx = await fixture({ output: '  ' });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.detected), 'detected state');
  assert.ok(fx.logs.includes('Wallpaper Engine query failed: empty output'));
  // The key is not left busy: the next press queries again.
  fx.actionEvent('run');
  await until(() => fx.execCalls.length === 2, 'second query');
});

test('the same failure on every press is logged once, not once per press', async (t) => {
  const fx = await fixture({ output: '' });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.execCalls.length === 1, 'first query');
  for (let i = 2; i <= 4; i += 1) {
    await until(() => fx.titles().filter((title) => title === TITLES.detected).length === i - 1, `draw ${i - 1}`);
    fx.actionEvent('run');
  }
  await until(() => fx.execCalls.length === 4, 'four queries');
  await pause(50);
  assert.equal(fx.logs.filter((line) => line.startsWith('Wallpaper Engine query failed')).length, 1);
});

test('every key title fits a D200 key: at most two short lines', () => {
  for (const { title } of Object.values(STATES)) {
    const lines = title.split('\n');
    assert.ok(lines.length <= 2, title);
    for (const line of lines) assert.ok(line.length <= 10, `${title} is too long for a key`);
  }
});

test('does not poll: nothing is queried until a press', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'first query');
  await pause(150);
  assert.equal(fx.discoveries(), 1);
  assert.equal(fx.execCalls.length, 1);
});

test('queries again on press (run) and ignores keydown and settings echoes', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'first query');
  fx.actionEvent('keydown');
  fx.actionEvent('paramfromapp', {});
  fx.actionEvent('paramfromplugin', {});
  await pause(100);
  assert.equal(fx.discoveries(), 1);
  fx.actionEvent('run');
  await until(() => fx.execCalls.length === 2, 'press query');
});

test('ignores a press while a query is still running', async (t) => {
  const fx = await fixture({ deferred: true });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.execCalls.length === 1, 'pending query');
  fx.actionEvent('run');
  fx.actionEvent('run');
  await pause(100);
  assert.equal(fx.execCalls.length, 1);
  fx.pending.forEach((finish) => finish());
  await until(() => fx.titles().includes('Sunset'), 'deferred result');
});

test('the inspector shows the state and its retry looks again', async (t) => {
  const fx = await fixture({ found: [NOT_RUNNING, FOUND_D] });
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes(TITLES.notRunning), 'not running state');

  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'hello' } });
  const hello = await until(() => fx.sent('sendToPropertyInspector')[0], 'status');
  assert.deepEqual(hello.payload, { type: 'status', state: 'notRunning', message: STATES.notRunning.detail });

  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'retry' } });
  const retried = await until(() => fx.sent('sendToPropertyInspector')[1], 'status after retry');
  assert.deepEqual(retried.payload, { type: 'status', state: 'ok', message: 'Wallpaper atual: Sunset' });
  assert.equal(fx.titles().at(-1), 'Sunset');
});

test('the inspector can retry a key the plugin did not know, and refuses to save a path', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'save', executablePath: String.raw`C:\evil\wallpaper64.exe` } });
  await pause(50);
  assert.equal(fx.sent('setSettings').length, 0);
  assert.equal(fx.sent('sendToPropertyInspector').length, 0);
  assert.equal(fx.execCalls.length, 0);

  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'hello' } });
  const hello = await until(() => fx.sent('sendToPropertyInspector')[0], 'status before any query');
  assert.match(hello.payload.message, /Detectando/);
  fx.actionEvent('sendToPlugin', undefined, { payload: { type: 'retry' } });
  await until(() => fx.titles().includes('Sunset'), 'retry draws');
});

test('stops drawing a key that Studio cleared', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'first query');
  fx.send('clear', { param: [{ uuid: ACTION_UUID, ...KEY }] });
  await pause(50);
  fx.actionEvent('setactive', undefined, { active: 'true' });
  await pause(100);
  assert.equal(fx.discoveries(), 1, 'a cleared key must not query');
});

test('ignores events that belong to another action', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.send('add', { uuid: 'com.example.other.action', ...KEY, param: {} });
  fx.send('run', { uuid: 'com.example.other.action', ...KEY });
  await pause(100);
  assert.equal(fx.discoveries(), 0);
  assert.deepEqual(fx.titles(), []);
});

test('refreshes when the key becomes active again, not when it is hidden', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'first query');
  fx.actionEvent('setactive', undefined, { active: false });
  await pause(100);
  assert.equal(fx.discoveries(), 1, 'a hidden key must not query');
  fx.actionEvent('setactive', undefined, { active: 'true' });
  await until(() => fx.execCalls.length === 2, 'query when active');
});

test('reconnects when Studio drops the socket and draws its keys again', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'first query');
  fx.sockets[0].terminate();
  await until(() => fx.sent('connected').length >= 2, 'second connected');
  await until(() => fx.execCalls.length === 2, 'redraw after reconnection');
  assert.equal(fx.gaveUp(), false);
});

test('stops retrying after the configured attempts when Studio is gone', async (t) => {
  const fx = await fixture({ maxAttempts: 2 });
  t.after(() => fx.close());
  for (const socket of fx.sockets) socket.terminate();
  fx.server.close();
  await until(() => fx.gaveUp(), 'give up', 3_000);
  assert.ok(fx.logs.some((line) => line.includes('no connection to Studio after 2 attempts')));
});

test('works with its default adapter and survives a host error', async () => {
  const handlers = {};
  const titles = [];
  const listen = (name) => (fn) => { handlers[name] = fn; };
  const host = {
    onConnected: listen('connected'), onClose: listen('close'), onError: listen('error'), onAdd: listen('add'),
    onParamFromApp: listen('paramfromapp'), onParamFromPlugin: listen('paramfromplugin'), onRun: listen('run'),
    onSetActive: listen('setactive'), onSendToPlugin: listen('sendToPlugin'), onClear: listen('clear'),
    reconnect() {}, setTitle: (_context, text) => titles.push(text), sendToPropertyInspector() {},
  };
  // A discovered path that cannot exist: the real adapter is built and fails like a vanished program.
  const discovery = { discover: async () => ({ status: 'found', executablePath: String.raw`C:\not-installed-anywhere\wallpaper64.exe` }) };
  const controller = new CurrentWallpaperController({ host, discovery });
  controller.attach();
  try {
    handlers.error(new Error('socket error'));
    handlers.add({ uuid: ACTION_UUID, context: 'c1', param: {} });
    await until(() => titles.includes(TITLES.queryFailed), 'query failed state');
    handlers.connected();
  } finally {
    controller.stop();
  }
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

// ---- Wallpaper Command keys (the six configurable positions) ----

test('each command key shows its own icon and label, from its own settings', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.commandEvent('add', 'p1', { command: 'pause' });
  fx.commandEvent('add', 'p2', { command: 'playlist', name: 'Chill' });
  fx.commandEvent('add', 'p3', {});
  await until(() => fx.faces('p3').length, 'third key drawn');
  assert.equal(fx.faces('p1')[0].data, 'data:image/png;base64,pause');
  assert.equal(fx.faces('p1')[0].textData, 'Pausar');
  assert.equal(fx.faces('p2')[0].textData, 'Playlist\nChill');
  assert.equal(fx.faces('p3')[0].textData, 'Próximo', 'an unconfigured key defaults to next');
  assert.equal(fx.execCalls.length, 0, 'drawing a command key never runs it');
});

test('a press runs exactly the documented command, through the discovered executable', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  const cases = [
    ['k1', { command: 'pause' }, ['-control', 'pause']],
    ['k2', { command: 'play' }, ['-control', 'play']],
    ['k3', { command: 'mute' }, ['-control', 'mute']],
    ['k4', { command: 'unmute' }, ['-control', 'unmute']],
    ['k5', { command: 'next' }, ['-control', 'nextWallpaper']],
    ['k6', { command: 'next', monitor: 2 }, ['-control', 'nextWallpaper', '-monitor', '2']],
    ['k7', { command: 'playlist', name: 'Chill' }, ['-control', 'openPlaylist', '-playlist', 'Chill']],
    ['k8', { command: 'profile', name: 'Work' }, ['-control', 'openProfile', '-profile', 'Work']],
  ];
  for (const [key, settings, args] of cases) {
    fx.commandEvent('add', key, settings);
    fx.commandEvent('run', key);
    await until(() => fx.execCalls.some((call) => call.args.join(' ') === args.join(' ')), args.join(' '));
  }
  for (const call of fx.execCalls) {
    assert.equal(call.file, ON_D);
    assert.equal(call.options.shell, false);
  }
  assert.equal(fx.execCalls.length, cases.length);
});

test('settings saved by the panel are applied to that key only', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.commandEvent('add', 'a', { command: 'pause' });
  fx.commandEvent('add', 'b', { command: 'mute' });
  fx.commandEvent('paramfromplugin', 'a', { command: 'play' });
  await until(() => fx.faces('a').at(-1)?.textData === 'Tocar', 'redrawn');
  fx.commandEvent('run', 'b');
  await until(() => fx.execCalls.length === 1, 'b ran');
  assert.deepEqual(fx.execCalls[0].args, ['-control', 'mute']);
});

test('a playlist without a name alerts and runs nothing; unsafe names are refused', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.commandEvent('add', 'n1', { command: 'playlist', name: '' });
  fx.commandEvent('add', 'n2', { command: 'profile', name: 'bad"name' });
  fx.commandEvent('run', 'n1');
  fx.commandEvent('run', 'n2');
  await until(() => fx.alerts('n1') && fx.alerts('n2'), 'alerts');
  assert.equal(fx.faces('n1')[0].textData, 'Playlist\nsem nome');
  assert.equal(fx.execCalls.length, 0);
  assert.equal(fx.discoveries(), 0);
});

test('a command when Wallpaper Engine is not running alerts and never starts it', async (t) => {
  const fx = await fixture({ found: [NOT_RUNNING] });
  t.after(() => fx.close());
  fx.commandEvent('add', 'c1', { command: 'pause' });
  fx.commandEvent('run', 'c1');
  await until(() => fx.alerts('c1'), 'alert');
  assert.equal(fx.execCalls.length, 0);
});

test('a command with inconclusive discovery alerts and logs why', async (t) => {
  const fx = await fixture({ found: [UNKNOWN] });
  t.after(() => fx.close());
  fx.commandEvent('add', 'c1', { command: 'play' });
  fx.commandEvent('run', 'c1');
  await until(() => fx.alerts('c1'), 'alert');
  assert.ok(fx.logs.includes('Wallpaper Engine detection inconclusive: more than one installation is running'));
});

test('a failed command alerts and logs only its reason', async (t) => {
  const fx = await fixture({ error: Object.assign(new Error(String.raw`C:\Users\Secret`), { code: 2 }) });
  t.after(() => fx.close());
  fx.commandEvent('add', 'c1', { command: 'mute' });
  fx.commandEvent('run', 'c1');
  await until(() => fx.alerts('c1'), 'alert');
  assert.ok(fx.logs.includes('Wallpaper Engine command mute failed: exit code 2'));
});

test('a second press while a command runs is dropped, not queued', async (t) => {
  const fx = await fixture({ deferred: true });
  t.after(() => fx.close());
  fx.commandEvent('add', 'c1', { command: 'pause' });
  fx.commandEvent('run', 'c1');
  await until(() => fx.execCalls.length === 1, 'running');
  fx.commandEvent('run', 'c1');
  fx.commandEvent('run', 'c1');
  await pause(100);
  assert.equal(fx.execCalls.length, 1);
  fx.pending.forEach((finish) => finish());
  await pause(30);
  fx.commandEvent('run', 'c1');
  await until(() => fx.execCalls.length === 2, 'runs again once finished');
});

test('next wallpaper refreshes the Current Wallpaper keys; pause does not', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  const queries = () => fx.execCalls.filter((call) => call.args[1] === 'getWallpaper').length;
  fx.actionEvent('add', {});
  await until(() => fx.titles().includes('Sunset'), 'current key drawn');
  fx.commandEvent('add', 'c1', { command: 'pause' });
  fx.commandEvent('run', 'c1');
  await until(() => fx.execCalls.length === 2, 'pause ran');
  await pause(50);
  assert.equal(queries(), 1);
  fx.commandEvent('add', 'c2', { command: 'next' });
  fx.commandEvent('run', 'c2');
  await until(() => queries() === 2, 'refreshed after next');
});

test('a command key pressed before Studio sent its settings still runs its default', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.commandEvent('run', 'late');
  await until(() => fx.execCalls.length === 1, 'ran');
  assert.deepEqual(fx.execCalls[0].args, ['-control', 'nextWallpaper']);
});

test('command keys redraw after a reconnection and when shown again, without running', async (t) => {
  const fx = await fixture();
  t.after(() => fx.close());
  fx.commandEvent('add', 'c1', { command: 'play' });
  await until(() => fx.faces('c1').length === 1, 'drawn');
  fx.commandEvent('setactive', 'c1', undefined, { active: 'true' });
  await until(() => fx.faces('c1').length === 2, 'redrawn when shown');
  fx.sockets[0].terminate();
  await until(() => fx.sent('connected').length >= 2, 'reconnected');
  await until(() => fx.faces('c1').length === 3, 'redrawn after reconnection');
  // The status panel messages do not apply to command keys.
  fx.commandEvent('sendToPlugin', 'c1', undefined, { payload: { type: 'hello' } });
  await pause(50);
  assert.equal(fx.sent('sendToPropertyInspector').length, 0);
  assert.equal(fx.execCalls.length, 0);
});
