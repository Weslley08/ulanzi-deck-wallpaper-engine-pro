import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISCOVERY_SCRIPT, WallpaperEngineDiscovery } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-discovery.js';

const ENV = { SystemRoot: String.raw`C:\Windows` };
const POWERSHELL = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
const ON_D = String.raw`D:\SteamLibrary\steamapps\common\wallpaper_engine\wallpaper64.exe`;
const ON_E = String.raw`E:\Jogos\Bibliotecas Steam\steamapps\common\wallpaper_engine\wallpaper32.exe`;

/** Each call of the fake PowerShell takes the next answer: a list of processes, or an Error. */
function harness({ answers = [[]], files = [ON_D, ON_E], platform = 'win32', env = ENV, deferred = false } = {}) {
  const calls = [];
  const pending = [];
  const discovery = new WallpaperEngineDiscovery({
    platform,
    env,
    statImpl: async (path) => {
      if (!files.includes(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return { isFile: () => true };
    },
    execFileImpl: (file, args, options, done) => {
      const answer = answers[Math.min(calls.length, answers.length - 1)];
      calls.push({ file, args, options });
      const finish = () => (answer instanceof Error ? done(answer, '', '') : done(null, typeof answer === 'string' ? answer : JSON.stringify(answer), ''));
      if (deferred) pending.push(finish);
      else finish();
    },
  });
  return { discovery, calls, pending };
}

test('finds a running wallpaper64.exe on another drive, through the system PowerShell and no shell', async () => {
  const { discovery, calls } = harness({ answers: [{ name: 'wallpaper64.exe', path: ON_D }] });
  assert.deepEqual(await discovery.discover(), { status: 'found', executablePath: ON_D });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, POWERSHELL);
  assert.deepEqual(calls[0].args, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', DISCOVERY_SCRIPT]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.ok(calls[0].options.timeout > 0 && calls[0].options.maxBuffer > 0);
});

test('the process query is a fixed, documented Win32_Process lookup', () => {
  assert.match(DISCOVERY_SCRIPT, /Get-CimInstance -ClassName Win32_Process/);
  assert.match(DISCOVERY_SCRIPT, /ExecutablePath/);
  assert.match(DISCOVERY_SCRIPT, /wallpaper64\.exe/);
  assert.match(DISCOVERY_SCRIPT, /wallpaper32\.exe/);
});

test('finds wallpaper32.exe in a folder with spaces and accents', async () => {
  const { discovery } = harness({ answers: [[{ name: 'wallpaper32.exe', path: ON_E }]] });
  assert.deepEqual(await discovery.discover(), { status: 'found', executablePath: ON_E });
});

test('reports not running when no process matches', async () => {
  assert.deepEqual(await harness({ answers: [[]] }).discovery.discover(), { status: 'not-running' });
  assert.deepEqual(await harness({ answers: [''] }).discovery.discover(), { status: 'not-running' });
});

test('several processes of one installation count once, whatever the case of the path', async () => {
  const { discovery } = harness({
    answers: [[{ name: 'wallpaper64.exe', path: ON_D }, { name: 'wallpaper64.exe', path: ON_D.toUpperCase() }]],
    files: [ON_D, ON_D.toUpperCase()],
  });
  assert.equal((await discovery.discover()).status, 'found');
});

test('two different installations running at once are inconclusive, not guessed', async () => {
  const { discovery } = harness({ answers: [[{ name: 'wallpaper64.exe', path: ON_D }, { name: 'wallpaper32.exe', path: ON_E }]] });
  const result = await discovery.discover();
  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /more than one/);
});

test('a process whose location cannot be read (another user, elevated) is inconclusive', async () => {
  const { discovery } = harness({ answers: [[{ name: 'wallpaper64.exe', path: null }]] });
  assert.deepEqual(await discovery.discover(), { status: 'unknown', reason: 'running, but its location could not be read' });
});

test('an unreadable instance next to a readable one uses the readable one', async () => {
  const { discovery } = harness({ answers: [[{ name: 'wallpaper64.exe', path: null }, { name: 'wallpaper64.exe', path: ON_D }]] });
  assert.equal((await discovery.discover()).status, 'found');
});

test('PowerShell failures and unreadable output are inconclusive, with a reason that holds no path', async () => {
  const cases = [
    [Object.assign(new Error(String.raw`C:\Users\Secret failed`), { code: 1 }), /exit code 1/],
    [Object.assign(new Error('slow'), { killed: true, signal: 'SIGTERM' }), /timed out/],
    [Object.assign(new Error('no powershell'), { code: 'ENOENT' }), /executable not found/],
    [Object.assign(new Error('denied'), { code: 'EACCES' }), /permission denied/],
    ['not json', /unreadable/],
  ];
  for (const [answer, reason] of cases) {
    const result = await harness({ answers: [answer] }).discovery.discover();
    assert.equal(result.status, 'unknown');
    assert.match(result.reason, reason);
    assert.doesNotMatch(result.reason, /Secret|Users|[A-Z]:\\/);
  }
});

test('a discovered path is validated before use', async () => {
  const wrongName = await harness({ answers: [[{ name: 'wallpaper64.exe', path: String.raw`D:\Tools\notwallpaper.exe` }]] }).discovery.discover();
  assert.deepEqual(wrongName, { status: 'unknown', reason: 'unexpected executable' });
  const relative = await harness({ answers: [[{ name: 'wallpaper64.exe', path: 'wallpaper64.exe' }]] }).discovery.discover();
  assert.deepEqual(relative, { status: 'unknown', reason: 'unexpected executable' });
  const gone = await harness({ answers: [[{ name: 'wallpaper64.exe', path: ON_D }]], files: [] }).discovery.discover();
  assert.deepEqual(gone, { status: 'unknown', reason: 'executable not found' });
});

test('does not run anything off Windows or without a known Windows folder', async () => {
  const offWindows = harness({ platform: 'linux' });
  assert.equal((await offWindows.discovery.discover()).status, 'unknown');
  assert.equal(offWindows.calls.length, 0);
  const noRoot = harness({ env: {} });
  assert.equal((await noRoot.discovery.discover()).status, 'unknown');
  assert.equal(noRoot.calls.length, 0);
  const relativeRoot = harness({ env: { SystemRoot: 'Windows' } });
  assert.equal((await relativeRoot.discovery.discover()).status, 'unknown');
  assert.equal(relativeRoot.calls.length, 0);
});

test('calls made while one is running share it, and the next call looks again', async () => {
  const { discovery, calls, pending } = harness({ answers: [[{ path: ON_D }], [{ path: ON_E }]], deferred: true });
  const first = discovery.discover();
  const second = discovery.discover();
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  pending.shift()();
  assert.equal((await first).status, 'found');

  // Wallpaper Engine restarted from another folder: nothing stale is reused.
  const later = discovery.discover();
  await new Promise((resolve) => setImmediate(resolve));
  pending.shift()();
  assert.deepEqual(await later, { status: 'found', executablePath: ON_E });
  assert.equal(calls.length, 2);
});
