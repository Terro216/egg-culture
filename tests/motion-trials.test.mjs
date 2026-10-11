import test from 'node:test';
import assert from 'node:assert/strict';
import { ChalazaSimulation, CHALAZA_HOLD_MS } from '../src/features/MotionTrials/chalaza.ts';
import { chalazaTilt, oracleSensorScore, trialOrientation } from '../src/features/MotionTrials/sensors.ts';
import { parseMotionScores } from '../src/features/MotionTrials/scores.ts';
import { validatePortalRun } from '../src/features/Portal/model.ts';

const neutral = { x: 0, y: 0 };
const snapshot = sim => ({ x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy, elapsed: sim.elapsedMs, hold: sim.holdMs, complete: sim.completed, rolled: sim.rolledAway });

test('Chalaza drift, damping and hold use identical steps at 30, 60 and 120 Hz and uneven rendering', () => {
  for (const manual of [true, false]) {
    const run = frames => {
      const sim = new ChalazaSimulation();
      for (const elapsed of frames) sim.advance(elapsed, { x: -0.2, y: -0.12 }, manual);
      return snapshot(sim);
    };
    const expected = run(Array(600).fill(1000 / 60));
    assert.deepEqual(run(Array(300).fill(1000 / 30)), expected);
    assert.deepEqual(run(Array(1200).fill(1000 / 120)), expected);
    assert.deepEqual(run(Array.from({ length: 100 }, () => [7, 19, 41, 33]).flat()), expected);
  }
});

test('idling, sensor noise, and one old correction cannot award a Chalaza win', () => {
  for (const manual of [true, false]) for (const noise of [neutral, { x: 0.01, y: -0.01 }]) {
    const sim = new ChalazaSimulation();
    sim.advance(1000 / 60, { x: -0.1, y: -0.1 }, manual);
    for (let frame = 0; frame < 60 * 120; frame++) sim.advance(1000 / 60, noise, manual);
    assert.equal(sim.completed, false);
    assert.ok(sim.holdMs < CHALAZA_HOLD_MS);
  }
});

test('active corrections can complete either control mode after a real five-second hold', () => {
  for (const manual of [true, false]) {
    const sim = new ChalazaSimulation();
    for (let frame = 0; frame < 60 * 30 && !sim.completed && !sim.rolledAway; frame++) {
      sim.advance(1000 / 60, { x: -sim.x * 1.5 - sim.vx * 10, y: -sim.y * 1.5 - sim.vy * 10 }, manual);
    }
    assert.equal(sim.completed, true);
    assert.equal(sim.rolledAway, false);
    assert.ok(sim.elapsedMs >= CHALAZA_HOLD_MS);
    assert.ok(sim.elapsedMs < 15000);
    const finished = snapshot(sim);
    sim.advance(1000, { x: 1, y: 1 }, manual);
    assert.deepEqual(snapshot(sim), finished, 'a completed run stays frozen');
  }
});

test('a long suspended frame cannot jump the drift clock ahead of physics or award a hidden win', () => {
  const stalled = new ChalazaSimulation(), bounded = new ChalazaSimulation();
  stalled.advance(90000, { x: -0.1, y: -0.1 }, true);
  bounded.advance(250, { x: -0.1, y: -0.1 }, true);
  assert.deepEqual(snapshot(stalled), snapshot(bounded));
  assert.ok(stalled.holdMs <= 250.000001);
  const before = snapshot(stalled);
  for (const elapsed of [NaN, Infinity, -1, 0]) stalled.advance(elapsed, neutral, true);
  assert.deepEqual(snapshot(stalled), before);
});

test('screen-relative tilt matches portrait, either landscape and upside-down orientations', () => {
  for (const angle of [0, 90, -90, 180, 270]) {
    const radians = angle * Math.PI / 180;
    const baseline = { alpha: 0, beta: 15, gamma: 5, angle };
    const current = { ...baseline, gamma: baseline.gamma + 8 * Math.cos(radians) - 4 * Math.sin(radians), beta: baseline.beta + 8 * Math.sin(radians) + 4 * Math.cos(radians) };
    const tilt = chalazaTilt(current, baseline);
    assert.ok(Math.abs(tilt.x + 0.2) < 1e-10);
    assert.ok(Math.abs(tilt.y + 0.1) < 1e-10);
  }
  assert.deepEqual(chalazaTilt({ alpha: 0, beta: 90, gamma: 20, angle: 90 }, { alpha: 0, beta: 0, gamma: 0, angle: 0 }), neutral, 'rotation requires a fresh neutral pose');
  assert.ok(Math.abs(chalazaTilt({ alpha: 0, beta: -179, gamma: 0, angle: 0 }, { alpha: 0, beta: 179, gamma: 0, angle: 0 }).y + 0.05) < 1e-10);
});

test('a legitimate zero sensor reading calibrates, unavailable or nonfinite readings do not', () => {
  assert.deepEqual(trialOrientation({ alpha: 0, beta: 0, gamma: 0 }, 0), { alpha: 0, beta: 0, gamma: 0, angle: 0 });
  for (const beta of [null, NaN, Infinity]) assert.equal(trialOrientation({ alpha: 0, beta, gamma: 0 }, 0), null);
  assert.equal(trialOrientation({ alpha: 0, beta: 0, gamma: null }, 0), null);
});

test('fractional Oracle sensor peaks produce an integer score accepted by the shared profile', () => {
  for (const peaks of [[27.1, 27.1, 27.1], [24.1, 28.7, 26.5], [24, 24, 24], [30, 30, 30]]) {
    const score = oracleSensorScore(peaks);
    assert.equal(Number.isSafeInteger(score), true);
    assert.ok(score >= 82 && score <= 100);
    assert.ok(validatePortalRun({ id: '00000000-0000-4000-8000-000000000001', game: 'oracle', score: String(score), peak: String(score), seconds: 0, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0 }));
  }
  for (const peaks of [[], [27, 27], [27, 27, 27, 27], [16, 16, 16], [31, 27, 27], [NaN, 27, 27]]) assert.equal(oracleSensorScore(peaks), null);
});

test('motion score storage accepts only bounded numeric fields and tolerates JSON null', () => {
  for (const value of [null, false, 1, 'score', [], { chalaza: '94', oracle: -1 }, { chalaza: 101, oracle: NaN }]) assert.deepEqual(parseMotionScores(value), {});
  assert.deepEqual(parseMotionScores({ chalaza: 94, oracle: 99.59999999999998, unrelated: 100 }), { chalaza: 94, oracle: 100 });
});
