// Wiring between Ulanzi Studio events and the single Current Wallpaper key.
// It only queries Wallpaper Engine when a key is added, its settings change, it is pressed or it becomes active.
// There is no timer while no key is shown.
import { checkExecutablePath, normalizeSettings } from './settings.js';
import { WallpaperEngineCli } from './wallpaper-engine-cli.js';

export const PLUGIN_UUID = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
export const ACTION_UUID = `${PLUGIN_UUID}.current-wallpaper`;

export const TITLES = Object.freeze({
  unconfigured: 'Set Wallpaper Engine path',
  unavailable: 'Wallpaper Engine unavailable',
});

const MAX_LABEL = 24;
const MAX_RECONNECT_WAIT_MS = 30_000;
const WALLPAPER_EXTENSION = /\.(pkg|mp4|webm|gif|html|png|jpe?g|json)$/i;

/**
 * What Studio sends with an event. The SDK adds `context`, the unique id of the key.
 * @typedef {{ uuid: string, context: string, param?: any, active?: unknown, payload?: any }} HostEvent
 * @typedef {(listener: (jsn: any) => void) => unknown} Listen
 * @typedef {object} Host The part of the SDK connection this controller uses.
 * @property {Listen} onConnected
 * @property {Listen} onClose
 * @property {Listen} onError
 * @property {Listen} onAdd
 * @property {Listen} onParamFromApp
 * @property {Listen} onParamFromPlugin
 * @property {Listen} onRun
 * @property {Listen} onSetActive
 * @property {Listen} onSendToPlugin
 * @property {Listen} onClear
 * @property {() => void} reconnect
 * @property {(context: string, text: string) => void} setTitle
 * @property {(settings: object, context: string) => void} setSettings
 * @property {(payload: object, context: string) => void} sendToPropertyInspector
 * @typedef {{ executablePath: string, busy: boolean }} KeyState
 * @typedef {{ getCurrentWallpaper(): Promise<string> }} WallpaperSource
 */

/**
 * Shows a short name, never the full path: a path can reveal folders the user keeps private.
 * @param {unknown} wallpaperPath
 */
export function wallpaperLabel(wallpaperPath) {
  const parts = String(wallpaperPath).split(/[\\/]+/).filter(Boolean);
  let name = parts.at(-1) ?? '';
  if (/^project\.json$/i.test(name) && parts.length > 1) name = parts.at(-2) ?? name;
  name = name.replace(WALLPAPER_EXTENSION, '');
  if (!name) return 'Wallpaper';
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
}

export class CurrentWallpaperController {
  /** @type {Host} */ #host;
  /** @type {(executablePath: string) => WallpaperSource} */ #createCli;
  /** @type {(message: string) => void} */ #log;
  /** @type {() => void} */ #onGiveUp;
  /** @type {number} */ #reconnectDelayMs;
  /** @type {number} */ #maxAttempts;
  /** @type {Map<string, KeyState>} */ #keys = new Map();
  #attempts = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */ #reconnectTimer = null;

  /**
   * @param {object} options
   * @param {Host} options.host
   * @param {(executablePath: string) => WallpaperSource} [options.createCli]
   * @param {(message: string) => void} [options.log]
   * @param {() => void} [options.onGiveUp] Called when Studio stays unreachable after every attempt.
   * @param {number} [options.reconnectDelayMs]
   * @param {number} [options.maxAttempts]
   */
  constructor({
    host,
    createCli = (executablePath) => new WallpaperEngineCli({ executablePath }),
    log = () => {},
    onGiveUp = () => {},
    reconnectDelayMs = 1_000,
    maxAttempts = 10,
  }) {
    this.#host = host;
    this.#createCli = createCli;
    this.#log = log;
    this.#onGiveUp = onGiveUp;
    this.#reconnectDelayMs = reconnectDelayMs;
    this.#maxAttempts = maxAttempts;
  }

  /** Registers every host event this plugin uses. Only run is treated as a press. */
  attach() {
    const host = this.#host;
    host.onConnected(() => this.#onConnected());
    host.onClose(() => this.#scheduleReconnect());
    // Without a listener the EventEmitter throws. A close event always follows an error.
    host.onError(() => {});
    host.onAdd((jsn) => this.#onSettings(jsn));
    host.onParamFromApp((jsn) => this.#onSettings(jsn));
    host.onParamFromPlugin((jsn) => this.#onSettings(jsn));
    host.onRun((jsn) => this.#onPress(jsn));
    host.onSetActive((jsn) => {
      if (String(jsn.active) === 'true' && this.#keys.has(jsn.context)) this.#refresh(jsn.context);
    });
    host.onSendToPlugin((jsn) => this.#onInspectorMessage(jsn));
    // clear has no message.context: each item in param carries its own.
    host.onClear((jsn) => {
      for (const { context } of jsn.param ?? []) this.#keys.delete(context);
    });
  }

  /** Stops reconnecting and forgets every key. Pending queries finish without drawing. */
  stop() {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#keys.clear();
  }

  #onConnected() {
    this.#attempts = 0;
    // After a reconnection the keys on the deck are still the same, so they are drawn again.
    for (const context of this.#keys.keys()) this.#refresh(context);
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) return;
    this.#attempts += 1;
    if (this.#attempts > this.#maxAttempts) {
      this.#log(`no connection to Studio after ${this.#maxAttempts} attempts`);
      this.#onGiveUp();
      return;
    }
    const wait = Math.min(this.#reconnectDelayMs * 2 ** (this.#attempts - 1), MAX_RECONNECT_WAIT_MS);
    this.#log(`no connection to Studio, retrying in ${wait / 1000} s (${this.#attempts} of ${this.#maxAttempts})`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#host.reconnect();
    }, wait);
  }

  /** @param {HostEvent} jsn */
  #onSettings(jsn) {
    if (jsn.uuid !== ACTION_UUID) return;
    const { executablePath } = normalizeSettings(jsn.param);
    this.#apply(jsn.context, executablePath);
  }

  /** @param {HostEvent} jsn */
  #onPress(jsn) {
    if (jsn.uuid !== ACTION_UUID) return;
    if (!this.#keys.has(jsn.context)) {
      this.#onSettings(jsn);
      return;
    }
    this.#refresh(jsn.context);
  }

  /**
   * Stores the path and queries only when the key is new or its path changed, so a settings echo never queries twice.
   * @param {string} context
   * @param {string} executablePath
   */
  #apply(context, executablePath) {
    const known = this.#keys.get(context);
    if (known && known.executablePath === executablePath) return;
    this.#keys.set(context, { executablePath, busy: false });
    this.#refresh(context);
  }

  /** @param {string} context */
  async #refresh(context) {
    const entry = this.#keys.get(context);
    if (!entry) return;
    if (!entry.executablePath) {
      this.#host.setTitle(context, TITLES.unconfigured);
      return;
    }
    // A press during a running query is ignored, so presses cannot stack processes.
    if (entry.busy) return;
    entry.busy = true;
    try {
      const wallpaper = await this.#createCli(entry.executablePath).getCurrentWallpaper();
      this.#draw(context, entry, wallpaperLabel(wallpaper));
    } catch {
      // The adapter's message stays out of the log: it can contain paths.
      this.#log('Wallpaper Engine query failed');
      this.#draw(context, entry, TITLES.unavailable);
    } finally {
      entry.busy = false;
    }
  }

  /**
   * @param {string} context
   * @param {KeyState} entry
   * @param {string} text
   */
  #draw(context, entry, text) {
    // Skip the drawing when the key was removed or its path changed during the query.
    if (this.#keys.get(context) !== entry) return;
    this.#host.setTitle(context, text);
  }

  /** @param {HostEvent} jsn */
  #onInspectorMessage(jsn) {
    const context = jsn.context;
    const message = jsn.payload ?? {};
    if (message.type === 'hello') {
      const entry = this.#keys.get(context);
      this.#host.sendToPropertyInspector(
        { type: 'settings', executablePath: entry?.executablePath ?? '' },
        context,
      );
      return;
    }
    if (message.type === 'save') {
      const checked = checkExecutablePath(message.executablePath);
      if (!checked.ok) {
        this.#host.sendToPropertyInspector({ type: 'status', ok: false, message: checked.message }, context);
        return;
      }
      this.#host.setSettings({ executablePath: checked.executablePath }, context);
      this.#apply(context, checked.executablePath);
      this.#host.sendToPropertyInspector(
        { type: 'status', ok: true, message: 'Saved. Press the key to refresh.' },
        context,
      );
    }
  }
}
