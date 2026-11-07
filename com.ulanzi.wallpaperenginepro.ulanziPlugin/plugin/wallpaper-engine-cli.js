// Official Wallpaper Engine CLI adapter. Zero dependencies, no shell and no dynamic commands.
// Docs: https://help.wallpaperengine.io/en/functionality/cli.html
// Intentionally independent from Ulanzi Studio so it can be tested without the device.
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

const EXECUTABLES = new Set(['wallpaper64.exe', 'wallpaper32.exe']);
// The documented commands a key may send. getWallpaper has its own method, because its output matters.
const CONTROL_COMMANDS = new Set(['nextWallpaper', 'pause', 'play', 'mute', 'unmute', 'openPlaylist', 'openProfile']);
const VALUE_FLAGS = new Set(['-playlist', '-profile', '-monitor']);
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_STDOUT_BYTES = 64 * 1024;

/** @param {unknown} value */
export function validateExecutable(value) {
  if (typeof value !== 'string' || !win32.isAbsolute(value) ||
      !EXECUTABLES.has(win32.basename(value).toLowerCase())) {
    throw new TypeError('Wallpaper Engine requires a trusted absolute path to wallpaper64.exe or wallpaper32.exe');
  }
  return value;
}

/**
 * Why a child process failed, in words safe for a log: never its message or output, which can hold paths.
 * @param {any} error
 */
export function describeFailure(error) {
  if (error?.killed || error?.signal) return 'timed out';
  if (error?.code === 'ENOENT') return 'executable not found';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'permission denied';
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output too large';
  if (Number.isInteger(error?.code)) return `exit code ${error.code}`;
  return 'failed';
}

/** @param {string} message @param {string} reason @param {unknown} [cause] */
function failure(message, reason, cause) {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { reason });
}

/** @param {number | null | undefined} monitor Checked again at run time, because callers are not type-checked. */
function monitorArgs(monitor) {
  // No -monitor means primary wallpaper according to Wallpaper Engine's documentation.
  // Index 0 is NOT assumed to be the user's primary screen.
  if (monitor === undefined || monitor === null) return [];
  if (!Number.isInteger(monitor) || monitor < 0 || monitor > 31) {
    throw new RangeError('Monitor must be an integer from 0 to 31');
  }
  return ['-monitor', String(monitor)];
}

export class WallpaperEngineCli {
  /**
   * @param {{ executablePath?: unknown, execFileImpl?: typeof execFile, platform?: NodeJS.Platform, timeoutMs?: number }} [options]
   */
  constructor({
    executablePath,
    execFileImpl = execFile,
    platform = process.platform,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    if (platform !== 'win32') {
      throw new Error('Wallpaper Engine CLI integration is only supported on Windows');
    }
    this.executablePath = validateExecutable(executablePath);
    if (typeof execFileImpl !== 'function') throw new TypeError('execFileImpl must be a function');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
      throw new RangeError('timeoutMs must be 100–30000');
    }
    this.execFileImpl = execFileImpl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Sends one documented command, such as ['-control', 'pause'] or ['-control', 'openPlaylist', '-playlist', 'Chill'].
   * Anything outside the allowlist is refused before a process starts.
   * @param {string[]} args
   * @returns {Promise<void>}
   */
  async sendCommand(args) {
    const [flag, control, ...rest] = Array.isArray(args) ? args : [];
    const pairs = rest.length % 2 === 0 && rest.every((value, i) => typeof value === 'string' && (i % 2 === 1 || VALUE_FLAGS.has(value)));
    if (flag !== '-control' || !CONTROL_COMMANDS.has(control) || !pairs) {
      throw failure('Refused an undocumented Wallpaper Engine command', 'refused');
    }
    return new Promise((resolve, reject) => {
      this.execFileImpl(
        this.executablePath,
        args,
        { shell: false, windowsHide: true, timeout: this.timeoutMs, maxBuffer: MAX_STDOUT_BYTES },
        (error) => (error ? reject(failure('Wallpaper Engine command failed or timed out', describeFailure(error), error)) : resolve()),
      );
    });
  }

  /**
   * @param {{ monitor?: number | null }} [options] A monitor index only when the user chose one: leave it out for the primary wallpaper.
   * @returns {Promise<string>}
   */
  async getCurrentWallpaper({ monitor } = {}) {
    const args = ['-control', 'getWallpaper', ...monitorArgs(monitor)];
    return new Promise((resolve, reject) => {
      this.execFileImpl(
        this.executablePath,
        args,
        { shell: false, windowsHide: true, timeout: this.timeoutMs, maxBuffer: MAX_STDOUT_BYTES },
        (error, stdout) => {
          if (error) {
            // Do not expose user directories or full process output in Ulanzi Studio logs.
            reject(failure('Wallpaper Engine query failed or timed out', describeFailure(error), error));
            return;
          }
          const output = String(stdout ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
          if (!output) {
            // Seen as a separate reason, because "ran fine but printed nothing" is the capture problem to tell apart.
            reject(failure('Wallpaper Engine returned no active wallpaper', 'empty output'));
            return;
          }
          resolve(output);
        },
      );
    });
  }
}
