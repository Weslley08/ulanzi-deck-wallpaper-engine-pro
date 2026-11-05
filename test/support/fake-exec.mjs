// Preloaded with --import when the packaged plugin is started for a smoke test or a measurement.
// It stands in for Windows and Wallpaper Engine, which a CI runner does not have:
// - the process list (PowerShell) reports one running wallpaper64.exe, an empty file made here in a temporary folder,
//   so the plugin's own check that the file exists still runs;
// - that executable answers getWallpaper with a fixed wallpaper;
// - the platform reads as Windows, because the plugin refuses to run anywhere else.
// So this proves the plugin starts, finds a running program and answers from the zip's own files,
// not that Wallpaper Engine or Windows' process list behave this way.
import childProcess from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const wallpaper = process.env.FAKE_WALLPAPER ?? String.raw`C:\Wallpapers\Sunset\project.json`;
const folder = mkdtempSync(join(tmpdir(), 'fake-wallpaper-engine-'));
const executable = join(folder, 'wallpaper64.exe');
writeFileSync(executable, '');
process.once('exit', () => rmSync(folder, { recursive: true, force: true }));

Object.defineProperty(process, 'platform', { value: 'win32' });
process.env.SystemRoot ??= String.raw`C:\Windows`;

childProcess.execFile = (file, _args, _options, done) => {
  const isProcessList = basename(String(file)).toLowerCase() === 'powershell.exe' || String(file).toLowerCase().endsWith('\\powershell.exe');
  const output = isProcessList ? JSON.stringify([{ name: 'wallpaper64.exe', path: executable }]) : wallpaper;
  setImmediate(() => done(null, output, ''));
  return /** @type {any} */ ({});
};
syncBuiltinESMExports();
