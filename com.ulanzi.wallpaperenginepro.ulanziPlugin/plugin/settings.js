// Settings come from Ulanzi Studio and from the Property Inspector: treat them as untrusted data.
// Anything that is not a trusted absolute path to Wallpaper Engine counts as not configured.
import { validateExecutable } from './wallpaper-engine-cli.js';

const MAX_PATH_LENGTH = 260;

/**
 * Returns a result the inspector can show. Messages never repeat the path, which may reveal private folders.
 * @param {unknown} value
 * @returns {{ ok: true, executablePath: string } | { ok: false, message: string }}
 */
export function checkExecutablePath(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return { ok: false, message: 'Enter the full path to wallpaper64.exe.' };
  if (candidate.length > MAX_PATH_LENGTH) return { ok: false, message: 'This path is too long.' };
  try {
    return { ok: true, executablePath: validateExecutable(candidate) };
  } catch {
    return { ok: false, message: 'Use the full path to wallpaper64.exe or wallpaper32.exe.' };
  }
}

/**
 * Settings saved for a key. An invalid or missing path becomes an empty string, which means "configuration required".
 * @param {{ executablePath?: unknown } | null} [raw]
 */
export function normalizeSettings(raw = {}) {
  const checked = checkExecutablePath(raw?.executablePath);
  return { executablePath: checked.ok ? checked.executablePath : '' };
}
