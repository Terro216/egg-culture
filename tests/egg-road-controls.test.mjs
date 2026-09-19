import assert from 'node:assert/strict';
import test from 'node:test';
import { RoadSteering, KeyboardSteering } from '../src/features/EggRoad/controls.ts';
import { createRoadTrack } from '../src/features/EggRoad/track.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { RollRhythm } from '../src/features/EggRoad/rhythm.ts';

test('a finger starts gently, can increase force and reverse without lifting or changing its anchor', () => {
  const input = new RoadSteering();
  input.begin(1, 200, 1);
  assert.ok(input.value > .1 && input.value < .4);
  const initial = input.value;
  input.move(1, 202); assert.equal(input.value, initial, 'small touch jitter is ignored');
  input.move(1, 220); assert.ok(input.value > initial && input.value < .7);
  input.move(1, 260); assert.equal(input.value, 1);
  input.move(1, 130); assert.ok(input.value < -.5, 'captured drag can steer across the centre');
  input.move(1, 200); assert.equal(input.value, initial, 'moving back has no cumulative drift');
  input.move(1, -1000); assert.equal(input.value, -1);
  input.end(1); assert.equal(input.value, 0);
  input.move(1, 900); assert.equal(input.value, 0, 'released or cancelled pointers cannot keep steering');
});

test('multiple fingers, cancellation and pause clear independently without latching a turn', () => {
  const input = new RoadSteering();
  input.begin(1, 100, -1); input.begin(2, 300, 1); assert.equal(input.value, 0);
  input.move(1, 45); assert.ok(input.value < -.7);
  input.end(2); assert.equal(input.value, -1);
  input.begin(3, 120, -1); assert.equal(input.value, -1, 'two fingers do not double the force');
  input.end(1); assert.ok(input.value > -.4 && input.value < 0);
  input.clear(); assert.equal(input.value, 0);
  input.move(3, 0); input.begin(4, NaN, 1); assert.equal(input.value, 0);
});

test('keyboard taps are gentle, holding reaches full force and release immediately stops applying it', () => {
  const input = new KeyboardSteering();
  for (let i = 0; i < 6; i++) input.step(1/120, 1);
  assert.ok(input.step(0, 1) > .2 && input.step(0, 1) < .4);
  for (let i = 0; i < 30; i++) input.step(1/120, 1);
  assert.equal(input.step(0, 1), 1);
  assert.equal(input.step(1/120, 0), 0);
  assert.ok(input.step(1/120, -1) < 0 && input.step(0, -1) > -.1);
  input.reset(); assert.equal(input.step(0, 1), 0);
});

test('gentle steering produces a smaller real correction and still allows rhythm', async () => {
  await initializePhysics();
  const track = createRoadTrack();
  const run = force => {
    const sim = new RoadSimulation(track);
    try { sim.start(); for (let i = 0; i < 42; i++) sim.step(force); return sim.position.x; }
    finally { sim.dispose(); }
  };
  const soft = run(.25), full = run(1);
  assert.ok(soft > 0 && full > soft * 2, 'force changes the physical path, not just the indicator');
  const rhythm = new RollRhythm();
  for (const direction of [1,-1,1,-1]) for (let i = 0; i < 48; i++) rhythm.step(1/120, direction * .25, direction, 15, true);
  assert.ok(rhythm.chain >= 3 && rhythm.charge > .6, 'normal light corrections remain eligible for rhythm');
});
