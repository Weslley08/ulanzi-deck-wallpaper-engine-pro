import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WallpaperEngineCli } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/wallpaper-engine-cli.js';

const executablePath = String.raw`C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe`;

function harness({ output = String.raw`C:\Wallpapers\cool\project.json`, error = null } = {}) {
  const calls = [];
  const cli = new WallpaperEngineCli({
    executablePath,
    platform: 'win32',
    execFileImpl: (exe, args, options, done) => {
      calls.push({ exe, args, options });
      done(error, output, '');
    },
  });
  return { cli, calls };
}

test('queries primary wallpaper without assuming monitor index zero', async () => {
  const { cli, calls } = harness();
  const result = await cli.getCurrentWallpaper();
  assert.equal(result, String.raw`C:\Wallpapers\cool\project.json`);
  assert.deepEqual(calls[0].args, ['-control', 'getWallpaper']);
  assert.equal(calls[0].exe, executablePath);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.ok(calls[0].options.timeout > 0);
});

test('passes explicit monitor index as separate arguments', async () => {
  const { cli, calls } = harness();
  await cli.getCurrentWallpaper({ monitor: 2 });
  assert.deepEqual(calls[0].args, ['-control', 'getWallpaper', '-monitor', '2']);
});

test('rejects invalid monitor inputs before launching a process', async () => {
  const { cli, calls } = harness();
  await assert.rejects(() => cli.getCurrentWallpaper({ monitor: -1 }), RangeError);
  await assert.rejects(() => cli.getCurrentWallpaper({ monitor: '0' }), RangeError);
  await assert.rejects(() => cli.getCurrentWallpaper({ monitor: 100 }), RangeError);
  assert.equal(calls.length, 0);
});

test('rejects untrusted executable names and non-absolute paths', () => {
  const valid = { platform: 'win32', execFileImpl: () => {} };
  assert.throws(() => new WallpaperEngineCli({ ...valid, executablePath: 'wallpaper64.exe' }), TypeError);
  assert.throws(() => new WallpaperEngineCli({ ...valid, executablePath: String.raw`C:\Temp\run.bat` }), TypeError);
  assert.throws(() => new WallpaperEngineCli({ ...valid, executablePath: '' }), TypeError);
});

test('does not pretend Windows-only integration works on macOS', () => {
  assert.throws(() => new WallpaperEngineCli({ executablePath, platform: 'darwin' }), /Windows/);
});

test('reports an empty stdout as missing wallpaper, not success', async () => {
  const { cli } = harness({ output: '' });
  await assert.rejects(() => cli.getCurrentWallpaper(), /no active wallpaper/);
});

test('handles command failures without exposing stdout paths in the error', async () => {
  const { cli } = harness({ error: new Error('process failure'), output: 'private-folder-name' });
  await assert.rejects(() => cli.getCurrentWallpaper(), (error) => {
    assert.match(error.message, /query failed/);
    assert.doesNotMatch(error.message, /private-folder-name/);
    return true;
  });
});

test('trims quoted output but preserves spaces inside Windows paths', async () => {
  const { cli } = harness({ output: '"C:\\Users\\User\\My Wallpapers\\scene.pkg"\r\n' });
  const result = await cli.getCurrentWallpaper();
  assert.equal(result, String.raw`C:\Users\User\My Wallpapers\scene.pkg`);
});
