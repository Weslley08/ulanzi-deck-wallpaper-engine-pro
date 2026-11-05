// Entry point started by Ulanzi Studio (CodePath in manifest.json). Wiring only: behaviour lives in controller.js.
import { readFileSync } from 'node:fs';
import { CurrentWallpaperController, PLUGIN_UUID } from './controller.js';
import { HostConnection, silenceConsole } from './host.js';

// The manifest is the one place the version lives.
const { Version: VERSION } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

silenceConsole();

// Studio shows a plugin's stderr next to its exit code, the only trace left when there is no socket.
// Only short messages come here: never settings or paths.
const report = (message, done) => process.stderr.write(`[Wallpaper Engine PRO] ${message}\n`, done);
process.stderr.on('error', () => {});

const host = new HostConnection();

function stop(reason, code = 0) {
  controller.stop();
  // stderr is asynchronous on Windows pipes, so exiting at once could lose the reason.
  report(`stopping: ${reason}`, () => process.exit(code));
  setTimeout(() => process.exit(code), 1000);
}

const controller = new CurrentWallpaperController({
  host,
  log: report,
  onGiveUp: () => stop('no connection to Studio', 1),
});
controller.attach();

// The host never relaunches this process, so one bad frame must not take the key down with it.
const logFailure = (error) => {
  report(`unexpected failure: ${error?.name}`);
  process.exitCode = 1;
};
process.on('uncaughtException', logFailure);
process.on('unhandledRejection', logFailure);
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

report(`${VERSION} starting on Node ${process.version}`);
host.connect(PLUGIN_UUID);
