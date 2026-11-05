import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkExecutablePath, normalizeSettings } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/settings.js';

const EXE = String.raw`C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe`;

test('accepts the full path to wallpaper64.exe or wallpaper32.exe, trimmed', () => {
  assert.deepEqual(checkExecutablePath(`  ${EXE}  `), { ok: true, executablePath: EXE });
  assert.equal(checkExecutablePath(String.raw`C:\WE\WALLPAPER32.EXE`).ok, true);
});

test('rejects relative paths, other programs and non-string values', () => {
  assert.equal(checkExecutablePath(String.raw`wallpaper64.exe`).ok, false);
  assert.equal(checkExecutablePath(String.raw`C:\Windows\notepad.exe`).ok, false);
  assert.equal(checkExecutablePath(42).ok, false);
  assert.equal(checkExecutablePath('').ok, false);
});

test('rejects overlong paths', () => {
  const tooLong = 'C:\\' + 'a'.repeat(300) + '\\wallpaper64.exe';
  assert.equal(checkExecutablePath(tooLong).ok, false);
});

test('error messages never repeat the path the user typed', () => {
  const message = checkExecutablePath(String.raw`C:\Private\Family\notepad.exe`).message;
  assert.doesNotMatch(message, /Private|Family|notepad/);
});

test('normalizeSettings keeps only a trusted path and otherwise means not configured', () => {
  assert.deepEqual(normalizeSettings({ executablePath: EXE }), { executablePath: EXE });
  assert.deepEqual(normalizeSettings({ executablePath: 'junk' }), { executablePath: '' });
  assert.deepEqual(normalizeSettings(undefined), { executablePath: '' });
  assert.deepEqual(normalizeSettings(null), { executablePath: '' });
});
