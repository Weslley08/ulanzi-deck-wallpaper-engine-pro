// Key images for the Wallpaper Command action, read once from resources/commands/ and kept as data URIs.
import { readFileSync } from 'node:fs';

const ICON_NAME = /^[a-z]+$/;
/** @type {Map<string, string | null>} */
const cache = new Map();

/** @param {string} name One of the icon names in commands.js. @returns {string | null} */
export function commandIcon(name) {
  if (!ICON_NAME.test(name)) return null;
  if (!cache.has(name)) {
    try {
      const data = readFileSync(new URL(`../resources/commands/${name}.png`, import.meta.url));
      cache.set(name, `data:image/png;base64,${data.toString('base64')}`);
    } catch {
      cache.set(name, null);
    }
  }
  return cache.get(name) ?? null;
}
