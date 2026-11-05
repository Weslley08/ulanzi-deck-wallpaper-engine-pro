// The commands a Wallpaper Command key can run. Only documented Wallpaper Engine commands:
// https://help.wallpaperengine.io/en/functionality/cli.html
// Monitor differences come from those docs: nextWallpaper with no -monitor changes ALL monitors,
// openPlaylist with no -monitor uses the FIRST one. An index is Wallpaper Engine's own numbering:
// 0 is not assumed to be the Windows primary display.

/**
 * @typedef {{ label: string, icon: string, control: string, nameFlag?: string, monitor?: boolean, changesWallpaper?: boolean }} CommandSpec
 * @typedef {{ command: string, name: string, monitor: number | null }} CommandSettings
 */

/** @type {Readonly<Record<string, CommandSpec>>} */
export const COMMANDS = Object.freeze({
  next: { label: 'Próximo', icon: 'next', control: 'nextWallpaper', monitor: true, changesWallpaper: true },
  pause: { label: 'Pausar', icon: 'pause', control: 'pause' },
  play: { label: 'Tocar', icon: 'play', control: 'play' },
  mute: { label: 'Mudo', icon: 'mute', control: 'mute' },
  unmute: { label: 'Som', icon: 'unmute', control: 'unmute' },
  playlist: { label: 'Playlist', icon: 'playlist', control: 'openPlaylist', nameFlag: '-playlist', monitor: true, changesWallpaper: true },
  profile: { label: 'Perfil', icon: 'profile', control: 'openProfile', nameFlag: '-profile', changesWallpaper: true },
});

export const DEFAULT_COMMAND = 'next';
const MAX_NAME = 64;
const MAX_LABEL_NAME = 10;
// Control characters and quotes are refused: they have no place in a playlist or profile name,
// and a quote would change how Windows splits the argument for the program.
const UNSAFE_NAME = /["\u0000-\u001f\u007f]/;

/** @param {unknown} value */
export function normalizeName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length <= MAX_NAME && !UNSAFE_NAME.test(name) ? name : '';
}

/** Empty, or an integer 0 to 31 as the settings panel sends it. @param {unknown} value @returns {number | null} */
export function normalizeMonitor(value) {
  if (value === '' || value === null || value === undefined) return null;
  const monitor = Number(value);
  return Number.isInteger(monitor) && monitor >= 0 && monitor <= 31 ? monitor : null;
}

/**
 * Settings come from the settings panel through Studio: untrusted, and possibly from an older version.
 * @param {any} raw
 * @returns {CommandSettings}
 */
export function normalizeCommandSettings(raw) {
  const command = Object.hasOwn(COMMANDS, raw?.command) ? raw.command : DEFAULT_COMMAND;
  const spec = COMMANDS[command];
  return {
    command,
    name: spec.nameFlag ? normalizeName(raw?.name) : '',
    monitor: spec.monitor ? normalizeMonitor(raw?.monitor) : null,
  };
}

/**
 * The argument list after the executable, or null when a required name is missing.
 * @param {CommandSettings} settings
 * @returns {string[] | null}
 */
export function commandArgs({ command, name, monitor }) {
  const spec = COMMANDS[command];
  if (!spec) return null;
  const args = ['-control', spec.control];
  if (spec.nameFlag) {
    if (!name) return null;
    args.push(spec.nameFlag, name);
  }
  if (spec.monitor && monitor !== null) args.push('-monitor', String(monitor));
  return args;
}

/** Two short lines for the key: the action, and the name or monitor when there is one. @param {CommandSettings} settings */
export function commandLabel({ command, name, monitor }) {
  const spec = COMMANDS[command];
  if (spec.nameFlag && !name) return `${spec.label}\nsem nome`;
  const detail = name || (monitor !== null ? `monitor ${monitor}` : '');
  const short = detail.length > MAX_LABEL_NAME ? `${detail.slice(0, MAX_LABEL_NAME - 1)}…` : detail;
  return short ? `${spec.label}\n${short}` : spec.label;
}
