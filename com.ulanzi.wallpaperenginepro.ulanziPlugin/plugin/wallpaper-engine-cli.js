// Official Wallpaper Engine CLI adapter. Zero dependencies, no shell and no dynamic commands.
// Docs: https://help.wallpaperengine.io/en/functionality/cli.html
// Intentionally independent from Ulanzi Studio so it can be tested without the device.
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';

const EXECUTABLES = new Set(['wallpaper64.exe', 'wallpaper32.exe']);
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
            reject(new Error('Wallpaper Engine query failed or timed out', { cause: error }));
            return;
          }
          const output = String(stdout ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
          if (!output) {
            reject(new Error('Wallpaper Engine returned no active wallpaper'));
            return;
          }
          resolve(output);
        },
      );
    });
  }
}
