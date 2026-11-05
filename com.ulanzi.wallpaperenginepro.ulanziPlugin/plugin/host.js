// Ulanzi Studio host connection built on the vendored, unmodified SDK (ulanzi-api/).
import UlanziApi from './ulanzi-api/index.js';

const SOCKET_OPEN = 1;

/**
 * The SDK writes every outgoing message to the console, including the executable path saved in settings.
 * This subclass skips that output without patching the vendored SDK.
 */
export class HostConnection extends UlanziApi {
  send(cmd, params) {
    if (this.websocket?.readyState !== SOCKET_OPEN) return;
    this.websocket.send(JSON.stringify({ cmd, uuid: this.uuid, key: this.key, actionid: this.actionid, ...params }));
  }

  /** connect() consumes process.argv on its first call, so a second one would fall back to the default port and language. */
  reconnect() {
    const { uuid, port, address, language } = this;
    this.connect(uuid, port, address);
    this.language = language;
  }
}

/** The SDK also logs every incoming message, which includes settings. Nothing from it goes to the console. */
export function silenceConsole() {
  const quiet = () => {};
  for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = quiet;
}
