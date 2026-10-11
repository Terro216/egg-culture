import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALCULATOR_STORAGE_KEY,
  defaultCalculatorState,
  loadCalculatorState,
  parseCalculatorState,
  remainingCalculatorMs,
  saveCalculatorState,
} from '../src/features/EggCalculator/calculatorState.ts';

const start = 1_800_000_000_000;
const running = {
  ...defaultCalculatorState(),
  size: 'S',
  temp: 'room',
  doneness: 'medium',
  soundOn: false,
  ceremony: 'running',
  totalMs: 249_000,
  remainingMs: 249_000,
  endAt: start + 249_000,
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('running ceremony resumes from its absolute deadline, preserving settings and sound', () => {
  const storage = memoryStorage();
  assert.equal(saveCalculatorState(storage, running), true);
  const restored = loadCalculatorState(storage, start + 31_750);
  assert.deepEqual(restored, running);
  assert.equal(remainingCalculatorMs(restored, start + 31_750), 217_250);
  assert.equal(remainingCalculatorMs(restored, start + 200_000), 49_000);
  assert.ok(storage.getItem(CALCULATOR_STORAGE_KEY));
});

test('paused remaining time survives a long absence without starting a new deadline', () => {
  const paused = { ...running, ceremony: 'paused', remainingMs: 187_250, endAt: 0 };
  const restored = parseCalculatorState(JSON.stringify(paused), start + 86_400_000);
  assert.deepEqual(restored, paused);
  assert.equal(remainingCalculatorMs(restored, start + 86_400_000), 187_250);
});

test('an elapsed ceremony restores to its finish screen, including the exact deadline', () => {
  for (const now of [running.endAt, running.endAt + 60_000]) {
    assert.deepEqual(parseCalculatorState(JSON.stringify(running), now), {
      ...running, ceremony: 'done', remainingMs: 0, endAt: 0,
    });
  }
});

test('idle preferences and a completed ceremony remain valid across reloads', () => {
  const idle = { ...defaultCalculatorState(), size: 'L', temp: 'room', doneness: 'hard', soundOn: false };
  const done = { ...running, ceremony: 'done', remainingMs: 0, endAt: 0 };
  assert.deepEqual(parseCalculatorState(JSON.stringify(idle), start), idle);
  assert.deepEqual(parseCalculatorState(JSON.stringify(done), start), done);
});

test('malformed or incompatible persisted values are ignored', () => {
  const invalid = [
    null, '', '{', 'null', 'true', '[]', '{}',
    JSON.stringify({ ...running, version: 2 }),
    JSON.stringify({ ...running, size: 'XL' }),
    JSON.stringify({ ...running, temp: 'hot' }),
    JSON.stringify({ ...running, doneness: 'raw' }),
    JSON.stringify({ ...running, soundOn: 'true' }),
    JSON.stringify({ ...running, ceremony: 'unknown' }),
    JSON.stringify({ ...running, endAt: 'tomorrow' }),
    JSON.stringify({ ...running, endAt: -1 }),
    JSON.stringify({ ...running, totalMs: null }),
    JSON.stringify({ ...running, totalMs: 0 }),
    JSON.stringify({ ...running, totalMs: 86_400_001 }),
    JSON.stringify({ ...running, remainingMs: -1 }),
    JSON.stringify({ ...running, remainingMs: running.totalMs + 1 }),
    JSON.stringify({ ...running, ceremony: 'paused', remainingMs: 0, endAt: 0 }),
    JSON.stringify({ ...running, ceremony: 'done', endAt: 0 }),
    JSON.stringify({ ...running, ceremony: 'idle' }),
  ];
  for (const raw of invalid) assert.equal(parseCalculatorState(raw, start), null, String(raw));
});

test('unavailable or full browser storage never throws into the timer', () => {
  const blocked = {
    getItem() { throw new Error('Storage denied'); },
    setItem() { throw new Error('Storage full'); },
  };
  assert.equal(loadCalculatorState(blocked, start), null);
  assert.equal(saveCalculatorState(blocked, running), false);
});

test('wall-clock rollback cannot display more than the whole ceremony', () => {
  assert.equal(remainingCalculatorMs(running, start - 60_000), running.totalMs);
  assert.equal(remainingCalculatorMs(running, running.endAt + 1000), 0);
});
