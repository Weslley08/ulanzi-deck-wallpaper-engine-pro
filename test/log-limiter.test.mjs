import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitRepeats } from '../com.ulanzi.wallpaperenginepro.ulanziPlugin/plugin/log-limiter.js';

function harness() {
  const lines = [];
  let clock = 0;
  const log = limitRepeats((line) => lines.push(line), { windowMs: 1_000, now: () => clock });
  return { lines, log, advance: (ms) => { clock += ms; } };
}

test('writes a message once per window and counts the repeats', () => {
  const { lines, log, advance } = harness();
  log('query failed: empty output');
  log('query failed: empty output');
  log('query failed: empty output');
  assert.deepEqual(lines, ['query failed: empty output']);
  advance(1_000);
  log('query failed: empty output');
  assert.deepEqual(lines, ['query failed: empty output', 'query failed: empty output (repeated 2 more times)']);
});

test('different messages are never merged, so each reason stays visible', () => {
  const { lines, log } = harness();
  log('query failed: empty output');
  log('query failed: timed out');
  log('query failed: empty output');
  assert.deepEqual(lines, ['query failed: empty output', 'query failed: timed out']);
});

test('keeps a bounded memory of messages', () => {
  const { lines, log } = harness();
  for (let i = 0; i < 150; i += 1) log(`message ${i}`);
  // The oldest was forgotten, so it is written again rather than counted.
  log('message 0');
  assert.equal(lines.length, 151);
});
