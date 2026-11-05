// Wiring between Ulanzi Studio events and the single Current Wallpaper key.
// Wallpaper Engine is found by itself on every query: there is no path to configure, save or type.
// It only looks when a key is added, pressed, shown again or retried from its settings. There is no timer while no key is shown.
import { WallpaperEngineCli } from './wallpaper-engine-cli.js';
import { WallpaperEngineDiscovery } from './wallpaper-engine-discovery.js';

export const PLUGIN_UUID = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
export const ACTION_UUID = `${PLUGIN_UUID}.current-wallpaper`;

export const TITLES = Object.freeze({
  notRunning: 'Wallpaper Engine não está em execução',
  undetected: 'Não foi possível detectar o Wallpaper Engine',
  queryFailed: 'Não foi possível ler o wallpaper',
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
 * @property {(payload: object, context: string) => void} sendToPropertyInspector
 * @typedef {{ busy: boolean, title: string }} KeyState
 * @typedef {{ getCurrentWallpaper(): Promise<string> }} WallpaperSource
 * @typedef {{ discover(): Promise<import('./wallpaper-engine-discovery.js').Discovery> }} Finder
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

/** @param {unknown} error */
const reasonOf = (error) => (typeof (/** @type {any} */ (error))?.reason === 'string' ? /** @type {any} */ (error).reason : 'failed');

export class CurrentWallpaperController {
  /** @type {Host} */ #host;
  /** @type {Finder} */ #discovery;
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
   * @param {Finder} [options.discovery] Finds the running Wallpaper Engine.
   * @param {(executablePath: string) => WallpaperSource} [options.createCli]
   * @param {(message: string) => void} [options.log]
   * @param {() => void} [options.onGiveUp] Called when Studio stays unreachable after every attempt.
   * @param {number} [options.reconnectDelayMs]
   * @param {number} [options.maxAttempts]
   */
  constructor({
    host,
    discovery = new WallpaperEngineDiscovery(),
    createCli = (executablePath) => new WallpaperEngineCli({ executablePath }),
    log = () => {},
    onGiveUp = () => {},
    reconnectDelayMs = 1_000,
    maxAttempts = 10,
  }) {
    this.#host = host;
    this.#discovery = discovery;
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
    // Settings carry nothing this plugin uses: an old saved path, if any, is ignored.
    host.onAdd((jsn) => this.#register(jsn));
    host.onParamFromApp((jsn) => this.#register(jsn));
    host.onParamFromPlugin((jsn) => this.#register(jsn));
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

  /** A key is queried once when it first appears. A settings echo for a known key does nothing. @param {HostEvent} jsn */
  #register(jsn) {
    if (jsn.uuid !== ACTION_UUID || this.#keys.has(jsn.context)) return;
    this.#keys.set(jsn.context, { busy: false, title: '' });
    this.#refresh(jsn.context);
  }

  /** @param {HostEvent} jsn */
  #onPress(jsn) {
    if (jsn.uuid !== ACTION_UUID) return;
    if (!this.#keys.has(jsn.context)) {
      this.#register(jsn);
      return;
    }
    this.#refresh(jsn.context);
  }

  /** @param {string} context */
  async #refresh(context) {
    const entry = this.#keys.get(context);
    // A press during a running query is ignored, so presses cannot stack processes.
    if (!entry || entry.busy) return;
    entry.busy = true;
    try {
      // Looked up again each time: the running program is confirmed before its command line is used,
      // so a stopped Wallpaper Engine is never started, and a restart from another folder is followed.
      const found = await this.#discovery.discover();
      if (found.status === 'not-running') {
        this.#draw(context, entry, TITLES.notRunning);
        return;
      }
      if (found.status !== 'found') {
        this.#log(`Wallpaper Engine detection inconclusive: ${found.reason}`);
        this.#draw(context, entry, TITLES.undetected);
        return;
      }
      try {
        const wallpaper = await this.#createCli(found.executablePath).getCurrentWallpaper();
        this.#draw(context, entry, wallpaperLabel(wallpaper));
      } catch (error) {
        // Only the reason is logged: the adapter's message and output can contain paths.
        this.#log(`Wallpaper Engine query failed: ${reasonOf(error)}`);
        this.#draw(context, entry, TITLES.queryFailed);
      }
    } catch {
      this.#log('Wallpaper Engine detection inconclusive: failed');
      this.#draw(context, entry, TITLES.undetected);
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
    // Skip the drawing when the key was removed during the query.
    if (this.#keys.get(context) !== entry) return;
    entry.title = text;
    this.#host.setTitle(context, text);
  }

  /** @param {string} context */
  #reportStatus(context) {
    const title = this.#keys.get(context)?.title;
    this.#host.sendToPropertyInspector({ type: 'status', message: title || 'Detectando o Wallpaper Engine…' }, context);
  }

  /** The inspector only shows the state and offers to look again. It never sends a path. @param {HostEvent} jsn */
  async #onInspectorMessage(jsn) {
    const context = jsn.context;
    const type = jsn.payload?.type;
    if (type === 'hello') {
      this.#reportStatus(context);
    } else if (type === 'retry') {
      if (!this.#keys.has(context)) this.#keys.set(context, { busy: false, title: '' });
      await this.#refresh(context);
      this.#reportStatus(context);
    }
  }
}
