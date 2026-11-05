// Measures what the plugin costs the user's machine. Run before each release and put the numbers
// in the release notes: node scripts/measure.mjs [idleSeconds]
// This runs against a fake host and a fake Wallpaper Engine, so it measures the plugin and neither of them.
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { pluginDir, root } from './lib/project.mjs';

const IDLE_SECONDS = Number(process.argv[2] ?? 30);
const PRESSES = 60;
const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
const preload = (file) => pathToFileURL(join(root, 'test', 'support', file)).href;

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(server, 'listening');

let socket;
let titles = 0;
let onConnection = () => {};
server.on('connection', (client) => {
  socket = client;
  client.on('message', (raw) => {
    if (JSON.parse(raw).cmd === 'setTitle') titles += 1;
  });
  onConnection();
});

const connected = new Promise((resolve) => { onConnection = resolve; });
const plugin = fork(join(pluginDir, 'plugin', 'app.js'), ['127.0.0.1', String(server.address().port), 'en'], {
  execArgv: ['--import', preload('fake-exec.mjs'), '--import', preload('metrics.mjs')],
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
});
await connected;
await sleep(200);

async function metrics() {
  plugin.send('metrics');
  const [reply] = await once(plugin, 'message');
  return reply;
}
const send = (message) => socket.send(JSON.stringify(message));
const key = { uuid: manifest.Actions[0].UUID, key: '0_0', actionid: 'measure' };
const MB = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;

async function until(check, label, ms = 10_000) {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(5);
  }
}

const atStart = await metrics();
const addedAt = performance.now();
send({ cmd: 'add', ...key, param: {} });
await until(() => titles >= 1, 'first title');
const firstDraw = performance.now() - addedAt;
await sleep(500);
const afterDraw = await metrics();
const titlesBeforeIdle = titles;

await sleep(IDLE_SECONDS * 1000);
const afterIdle = await metrics();
const idleTitles = titles - titlesBeforeIdle;

const beforePresses = await metrics();
for (let i = 0; i < PRESSES; i += 1) {
  send({ cmd: 'run', ...key });
  await sleep(50);
}
await until(() => titles >= titlesBeforeIdle + idleTitles + PRESSES, 'press titles', 30_000);
const afterPresses = await metrics();
plugin.kill();

const idlePercent = (((afterIdle.cpuMs - afterDraw.cpuMs) / (IDLE_SECONDS * 1000)) * 100).toFixed(2);
console.log(`Node ${process.version}, 1 key`);
console.log(`Memory at start, no keys    ${MB(atStart.rss)}`);
console.log(`Memory with the key drawn   ${MB(afterDraw.rss)} (heap ${MB(afterDraw.heapUsed)})`);
console.log(`Memory after ${IDLE_SECONDS} s idle       ${MB(afterIdle.rss)}`);
console.log(`Memory after ${PRESSES} presses      ${MB(afterPresses.rss)}`);
console.log(`CPU idle                    ${idlePercent}% of one core`);
console.log(`Redraws while idle          ${idleTitles} in ${IDLE_SECONDS} s`);
console.log(`First draw of the key       ${firstDraw.toFixed(0)} ms, ${(afterDraw.cpuMs - atStart.cpuMs).toFixed(0)} ms of CPU`);
console.log(`One press                   ${((afterPresses.cpuMs - beforePresses.cpuMs) / PRESSES).toFixed(1)} ms of CPU`);

for (const client of server.clients) client.terminate();
server.close();
