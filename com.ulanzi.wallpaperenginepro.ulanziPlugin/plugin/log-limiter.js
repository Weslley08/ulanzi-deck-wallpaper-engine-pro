// A key pressed again and again with the same failure would write the same line each time.
// The first one is written at once; repeats within the window are only counted, and the count
// goes with the next line written for that message, so nothing useful for diagnosis is lost.

/**
 * @param {(message: string) => void} log
 * @param {{ windowMs?: number, now?: () => number }} [options]
 * @returns {(message: string) => void}
 */
export function limitRepeats(log, { windowMs = 60_000, now = Date.now } = {}) {
  /** @type {Map<string, { at: number, repeats: number }>} */
  const seen = new Map();
  return (message) => {
    const time = now();
    const last = seen.get(message);
    if (last && time - last.at < windowMs) {
      last.repeats += 1;
      return;
    }
    const suffix = last?.repeats ? ` (repeated ${last.repeats} more times)` : '';
    seen.set(message, { at: time, repeats: 0 });
    // A plugin that runs for days must not keep every message it ever wrote.
    if (seen.size > 100) seen.delete(seen.keys().next().value ?? '');
    log(`${message}${suffix}`);
  };
}
