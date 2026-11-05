// Preloaded with --import when the packaged plugin is started for a smoke test or a measurement.
// It stands in for Wallpaper Engine, which is not installed on a CI runner: execFile answers with a fixed wallpaper,
// and the platform reads as Windows, because the adapter refuses to run anywhere else.
// So this proves the plugin starts and answers from the zip's own files, not that Wallpaper Engine itself works.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const wallpaper = process.env.FAKE_WALLPAPER ?? String.raw`C:\Wallpapers\Sunset\project.json`;

Object.defineProperty(process, 'platform', { value: 'win32' });
childProcess.execFile = (_file, _args, _options, done) => {
  setImmediate(() => done(null, wallpaper, ''));
  return /** @type {any} */ ({});
};
syncBuiltinESMExports();
