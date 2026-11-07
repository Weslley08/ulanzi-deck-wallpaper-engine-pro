// Finds the running Wallpaper Engine by itself: the user never types or picks a path.
// Windows documents each process's executable in the Win32_Process class (ExecutablePath), read here with
// PowerShell's Get-CimInstance. The command is a constant: nothing from settings or the host reaches it.
// It finds the program in any Steam library, on any drive, and needs no administrator rights for a process
// of the same user. The path of an elevated process can come back empty: that counts as inconclusive.
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { win32 } from 'node:path';
import { describeFailure, validateExecutable } from './wallpaper-engine-cli.js';

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// UTF-8 output, so a folder with accents survives the pipe. -InputObject keeps an empty list as [].
export const DISCOVERY_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  "$found = Get-CimInstance -ClassName Win32_Process -Filter \"Name = 'wallpaper64.exe' OR Name = 'wallpaper32.exe'\" -ErrorAction Stop",
  'ConvertTo-Json -Compress -InputObject @($found | ForEach-Object { @{ name = $_.Name; path = $_.ExecutablePath } })',
].join('; ');

/**
 * @typedef {{ status: 'found', executablePath: string }
 *   | { status: 'not-running' }
 *   | { status: 'unknown', reason: string }} Discovery
 * The reason is for logs: it never holds a path.
 */

/** @param {string} reason @returns {Discovery} */
const unknown = (reason) => ({ status: 'unknown', reason });

/** The system's own PowerShell, by absolute path, so nothing earlier on PATH can stand in for it. */
function powershellPath(/** @type {NodeJS.ProcessEnv} */ env) {
  const root = env.SystemRoot ?? env.windir;
  if (!root || !win32.isAbsolute(root)) return null;
  return win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export class WallpaperEngineDiscovery {
  /** @type {Promise<Discovery> | null} */ #pending = null;

  /**
   * @param {{ execFileImpl?: typeof execFile, statImpl?: (path: string) => Promise<{ isFile(): boolean }>,
   *   platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, timeoutMs?: number }} [options]
   */
  constructor({ execFileImpl = execFile, statImpl = stat, platform = process.platform, env = process.env, timeoutMs = TIMEOUT_MS } = {}) {
    this.execFileImpl = execFileImpl;
    this.statImpl = statImpl;
    this.platform = platform;
    this.env = env;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Looks again on every call, so a restart from another folder is noticed and a stopped program is never launched.
   * Calls made while one is running share it: keys refreshed together start one PowerShell, not one each.
   * @returns {Promise<Discovery>}
   */
  discover() {
    this.#pending ??= this.#run().finally(() => { this.#pending = null; });
    return this.#pending;
  }

  /** @returns {Promise<Discovery>} */
  async #run() {
    if (this.platform !== 'win32') return unknown('Wallpaper Engine only runs on Windows');
    const powershell = powershellPath(this.env);
    if (!powershell) return unknown('Windows folder unknown');

    let stdout;
    try {
      stdout = await this.#exec(powershell);
    } catch (error) {
      return unknown(`process list unavailable (${describeFailure(error)})`);
    }

    let entries;
    try {
      entries = JSON.parse(stdout.trim() || '[]');
    } catch {
      return unknown('process list unreadable');
    }
    if (!Array.isArray(entries)) entries = [entries];
    if (!entries.length) return { status: 'not-running' };

    // Windows paths ignore case, so two processes of one installation count once.
    const paths = new Map();
    for (const entry of entries) {
      const path = typeof entry?.path === 'string' ? entry.path.trim() : '';
      if (path) paths.set(path.toLowerCase(), path);
    }
    if (!paths.size) return unknown('running, but its location could not be read');
    if (paths.size > 1) return unknown('more than one installation is running');

    const [executablePath] = paths.values();
    try {
      validateExecutable(executablePath);
    } catch {
      return unknown('unexpected executable');
    }
    try {
      if (!(await this.statImpl(executablePath)).isFile()) return unknown('executable not found');
    } catch {
      return unknown('executable not found');
    }
    return { status: 'found', executablePath };
  }

  /** @param {string} powershell @returns {Promise<string>} */
  #exec(powershell) {
    return new Promise((resolve, reject) => {
      this.execFileImpl(
        powershell,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', DISCOVERY_SCRIPT],
        { shell: false, windowsHide: true, timeout: this.timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
        (error, stdout) => (error ? reject(error) : resolve(String(stdout ?? ''))),
      );
    });
  }
}
