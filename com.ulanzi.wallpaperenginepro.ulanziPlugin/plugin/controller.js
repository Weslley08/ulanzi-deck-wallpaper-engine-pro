// Wiring between Ulanzi Studio events and the plugin's two actions:
// - Current Wallpaper shows the name of the wallpaper on the primary monitor;
// - Wallpaper Command runs one documented command chosen per key (six keys on a D200, or any number).
// Wallpaper Engine is found by itself on every use: there is no path to configure, save or type.
// Nothing runs on a timer: only when a key is added, pressed, shown again or retried from its settings.
import { COMMANDS, commandArgs, commandLabel, normalizeCommandSettings } from './commands.js';
import { commandIcon } from './icons.js';
import { limitRepeats } from './log-limiter.js';
import { WallpaperEngineCli } from './wallpaper-engine-cli.js';
import { WallpaperEngineDiscovery } from './wallpaper-engine-discovery.js';

export const PLUGIN_UUID = 'com.ulanzi.wallpaperenginepro.ulanziPlugin';
export const ACTION_UUID = `${PLUGIN_UUID}.current-wallpaper`;
export const COMMAND_UUID = `${PLUGIN_UUID}.command`;

/**
 * Each state has a short title that fits a D200 key, and a sentence for the settings panel.
 * `detected` is the reproduced case: the program is found and answers, but getWallpaper prints nothing.
 */
export const STATES = Object.freeze({
  detecting: { title: '…', detail: 'Detectando o Wallpaper Engine…' },
  notRunning: { title: 'WE\nfechado', detail: 'Wallpaper Engine não está em execução. Abra-o e pressione a tecla.' },
  undetected: { title: 'WE não\ndetectado', detail: 'Não foi possível detectar o Wallpaper Engine. Tente detectar novamente.' },
  detected: { title: 'WE\nativo', detail: 'Wallpaper Engine detectado, mas ele não informou o wallpaper atual. Os comandos continuam funcionando.' },
  queryFailed: { title: 'WE sem\nresposta', detail: 'Wallpaper Engine detectado, mas não respondeu à consulta do wallpaper.' },
});

/** The titles alone, for callers that only draw. */
export const TITLES = Object.freeze(Object.fromEntries(Object.entries(STATES).map(([name, { title }]) => [name, title])));

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
 * @property {(context: string, data: string, text: string) => void} setBaseDataIcon
 * @property {(context: string) => void} showAlert
 * @property {(payload: object, context: string) => void} sendToPropertyInspector
 * @typedef {{ kind: 'current', busy: boolean, title: string, state: string, detail: string }} CurrentKey
 * @typedef {{ kind: 'command', busy: boolean, settings: import('./commands.js').CommandSettings }} CommandKey
 * @typedef {CurrentKey | CommandKey} KeyState
 * @typedef {{ getCurrentWallpaper(): Promise<string>, sendCommand(args: string[]): Promise<void> }} WallpaperSource
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

/** @returns {CurrentKey} */
const newKey = () => ({ kind: 'current', busy: false, title: '', state: 'detecting', detail: STATES.detecting.detail });

/** @param {unknown} error */
const reasonOf = (error) => (typeof (/** @type {any} */ (error))?.reason === 'string' ? /** @type {any} */ (error).reason : 'failed');

export class CurrentWallpaperController {
  /** @type {Host} */ #host;
  /** @type {Finder} */ #discovery;
  /** @type {(executablePath: string) => WallpaperSource} */ #createCli;
  /** @type {(name: string) => string | null} */ #icons;
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
   * @param {(name: string) => string | null} [options.icons] Data URI of a command icon.
   * @param {(message: string) => void} [options.log]
   * @param {() => void} [options.onGiveUp] Called when Studio stays unreachable after every attempt.
   * @param {number} [options.reconnectDelayMs]
   * @param {number} [options.maxAttempts]
   * @param {number} [options.logWindowMs] How long an identical log line is only counted, not written again.
   */
  constructor({
    host,
    discovery = new WallpaperEngineDiscovery(),
    createCli = (executablePath) => new WallpaperEngineCli({ executablePath }),
    icons = commandIcon,
    log = () => {},
    onGiveUp = () => {},
    reconnectDelayMs = 1_000,
    maxAttempts = 10,
    logWindowMs = 60_000,
  }) {
    this.#host = host;
    this.#discovery = discovery;
    this.#createCli = createCli;
    this.#icons = icons;
    this.#log = limitRepeats(log, { windowMs: logWindowMs });
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
    host.onAdd((jsn) => this.#register(jsn));
    host.onParamFromApp((jsn) => this.#register(jsn));
    host.onParamFromPlugin((jsn) => this.#register(jsn));
    host.onRun((jsn) => this.#onPress(jsn));
    host.onSetActive((jsn) => {
      if (String(jsn.active) === 'true') this.#show(jsn.context);
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
    for (const context of this.#keys.keys()) this.#show(context);
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

  /** Draws a key again: a command key only redraws, a Current Wallpaper key queries. @param {string} context */
  #show(context) {
    const entry = this.#keys.get(context);
    if (entry?.kind === 'command') this.#drawCommand(context, entry);
    else if (entry) this.#refresh(context);
  }

  /**
   * A Current Wallpaper key is queried once when it first appears; a settings echo does nothing.
   * A command key takes its settings every time, because that is how the settings panel saves them.
   * @param {HostEvent} jsn
   */
  #register(jsn) {
    if (jsn.uuid === COMMAND_UUID) {
      const known = this.#keys.get(jsn.context);
      /** @type {CommandKey} */
      const entry = known?.kind === 'command' ? known : { kind: 'command', busy: false, settings: normalizeCommandSettings({}) };
      entry.settings = normalizeCommandSettings(jsn.param);
      this.#keys.set(jsn.context, entry);
      this.#drawCommand(jsn.context, entry);
      return;
    }
    if (jsn.uuid !== ACTION_UUID || this.#keys.has(jsn.context)) return;
    this.#keys.set(jsn.context, newKey());
    this.#refresh(jsn.context);
  }

  /** @param {HostEvent} jsn */
  #onPress(jsn) {
    if (jsn.uuid !== ACTION_UUID && jsn.uuid !== COMMAND_UUID) return;
    const entry = this.#keys.get(jsn.context);
    if (!entry) {
      this.#register(jsn);
      if (jsn.uuid === COMMAND_UUID) this.#runCommand(jsn.context);
      return;
    }
    if (entry.kind === 'command') this.#runCommand(jsn.context);
    else this.#refresh(jsn.context);
  }

  /** @param {string} context */
  async #refresh(context) {
    const entry = this.#keys.get(context);
    // A press during a running query is ignored, so presses cannot stack processes.
    if (!entry || entry.kind !== 'current' || entry.busy) return;
    entry.busy = true;
    try {
      // Looked up again each time: the running program is confirmed before its command line is used,
      // so a stopped Wallpaper Engine is never started, and a restart from another folder is followed.
      const found = await this.#discovery.discover();
      if (found.status === 'not-running') {
        this.#draw(context, entry, 'notRunning');
        return;
      }
      if (found.status !== 'found') {
        this.#log(`Wallpaper Engine detection inconclusive: ${found.reason}`);
        this.#draw(context, entry, 'undetected');
        return;
      }
      try {
        const name = wallpaperLabel(await this.#createCli(found.executablePath).getCurrentWallpaper());
        this.#draw(context, entry, 'ok', name, `Wallpaper atual: ${name}`);
      } catch (error) {
        // Only the reason is logged: the adapter's message and output can contain paths.
        const reason = reasonOf(error);
        this.#log(`Wallpaper Engine query failed: ${reason}`);
        // An empty answer still proves the program is there: say so, instead of an error.
        this.#draw(context, entry, reason === 'empty output' ? 'detected' : 'queryFailed');
      }
    } catch {
      this.#log('Wallpaper Engine detection inconclusive: failed');
      this.#draw(context, entry, 'undetected');
    } finally {
      entry.busy = false;
    }
  }

  /** @param {string} context */
  async #runCommand(context) {
    const entry = this.#keys.get(context);
    // One command per key at a time: a second press while it runs is dropped, not queued.
    if (!entry || entry.kind !== 'command' || entry.busy) return;
    const { command } = entry.settings;
    const args = commandArgs(entry.settings);
    if (!args) {
      // A playlist or profile key without a name: nothing to run until it is set.
      this.#host.showAlert(context);
      return;
    }
    entry.busy = true;
    try {
      const found = await this.#discovery.discover();
      if (found.status !== 'found') {
        // Never started when it is not running: the alert says the press did nothing.
        if (found.status === 'unknown') this.#log(`Wallpaper Engine detection inconclusive: ${found.reason}`);
        this.#host.showAlert(context);
        return;
      }
      await this.#createCli(found.executablePath).sendCommand(args);
      if (COMMANDS[command].changesWallpaper) this.#refreshCurrentKeys();
    } catch (error) {
      this.#log(`Wallpaper Engine command ${command} failed: ${reasonOf(error)}`);
      if (this.#keys.get(context) === entry) this.#host.showAlert(context);
    } finally {
      entry.busy = false;
    }
  }

  /** After a command that changes the wallpaper, the Current Wallpaper keys show the new one. */
  #refreshCurrentKeys() {
    for (const [context, entry] of this.#keys) if (entry.kind === 'current') this.#refresh(context);
  }

  /** @param {string} context @param {CommandKey} entry */
  #drawCommand(context, entry) {
    const spec = COMMANDS[entry.settings.command];
    const label = commandLabel(entry.settings);
    const icon = this.#icons(spec.icon);
    if (icon) this.#host.setBaseDataIcon(context, icon, label);
    else this.#host.setTitle(context, label);
  }

  /**
   * @param {string} context
   * @param {CurrentKey} entry
   * @param {string} state A name in STATES, or 'ok' with its own title and detail.
   * @param {string} [title]
   * @param {string} [detail]
   */
  #draw(context, entry, state, title, detail) {
    // Skip the drawing when the key was removed during the query.
    if (this.#keys.get(context) !== entry) return;
    const known = /** @type {Record<string, { title: string, detail: string }>} */ (STATES)[state];
    entry.state = state;
    entry.title = title ?? known.title;
    entry.detail = detail ?? known.detail;
    this.#host.setTitle(context, entry.title);
  }

  /** @param {string} context */
  #reportStatus(context) {
    const entry = this.#keys.get(context);
    const { state, detail } = entry?.kind === 'current' ? entry : newKey();
    this.#host.sendToPropertyInspector({ type: 'status', state, message: detail }, context);
  }

  /** The Current Wallpaper inspector only shows the state and offers to look again. It never sends a path. @param {HostEvent} jsn */
  async #onInspectorMessage(jsn) {
    const context = jsn.context;
    const type = jsn.payload?.type;
    if (this.#keys.get(context)?.kind === 'command') return;
    if (type === 'hello') {
      this.#reportStatus(context);
    } else if (type === 'retry') {
      if (!this.#keys.has(context)) this.#keys.set(context, newKey());
      await this.#refresh(context);
      this.#reportStatus(context);
    }
  }
}
