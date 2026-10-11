import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUN_ROADS, funRoadCopy } from '../src/features/EggRoad/funRoads.ts';
import { parseRoadCode, roadCode } from '../src/features/EggRoad/seed.ts';
import { createTrackForSpec } from '../src/features/EggRoad/trackSpec.ts';
import { createStuntTrack } from '../src/features/EggRoad/stunts.ts';
import { nearestRoadSample } from '../src/features/EggRoad/track.ts';
import { packTrack, unpackTrack } from '../src/features/EggRoad/trackTransfer.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { SteeringRamp } from '../src/features/EggRoad/controls.ts';
import { LoopCamera } from '../src/features/EggRoad/loopCamera.ts';
import { createRoadRecordStore } from '../src/server/roadRecords.ts';
import { parsePublishedRun } from '../src/features/EggRoad/leaderboard.ts';
import { plausibleRoadRun } from '../src/server/roadValidation.ts';
await initializePhysics();

function driver(sim, rhythm = true) {
 const ramp = new SteeringRamp(); let target = .65;
 return () => {
  const track = sim.track;
  const index = nearestRoadSample(track, sim.position, Math.max(0, sim.sampleIndex - 30), Math.min(track.samples.length - 1, sim.sampleIndex + 120));
  const sample = track.samples[index], offset = sim.position.clone().sub(sample.position).dot(sample.right), lateral = new Vector3().copy(sim.body.linvel()).dot(sample.right);
  if ((target > 0 && offset > target) || (target < 0 && offset < target)) target = -target;
  sim.step(ramp.step(1 / 120, Math.max(-1, Math.min(1, ((rhythm ? target : 0) - offset - lateral * .25) * 1.5))));
 };
}

test('every fun road has a strict distinct code, translated description and reproducible transferable geometry', () => {
 assert.equal(FUN_ROADS.length, 6);
 assert.equal(new Set(FUN_ROADS.map(r => roadCode(r.spec))).size, 6);
 for (const entry of FUN_ROADS) {
  const code = roadCode(entry.spec);
  assert.deepEqual(parseRoadCode(code.toLowerCase()), entry.spec);
  assert.deepEqual(parseRoadCode(`https://egg.ilyamedve.dev/en/play/?road=${code}`), entry.spec);
  for (const lang of ['ru', 'en']) assert.ok(funRoadCopy(entry.spec, lang)?.hint);
  const a = createTrackForSpec(entry.spec), b = unpackTrack(packTrack(createTrackForSpec(entry.spec)));
  assert.deepEqual(b.samples, a.samples); assert.deepEqual(b.chunks, a.chunks); assert.deepEqual(b.loop, a.loop); assert.equal(b.speedRun, a.speedRun);
  for (const s of a.samples) { assert.ok(Math.abs(s.tangent.dot(s.normal)) < 1e-9); assert.ok(Math.abs(s.right.dot(s.normal)) < 1e-9); assert.ok(s.width >= 4.8); }
 }
 for (const code of ['EGG3-T-8-0', 'EGG3-T-8-6', 'EGG3-T-9-1', 'EGG2-T-8-2']) assert.equal(parseRoadCode(code), null);
 assert.equal(parseRoadCode('EGG3-R-8-2').mode, 'seed');
});

test('the drop has a real open gap and each of the three heights can be reached before the flight limit', async () => {
 for (const aim of [-20, 0, 20]) {
  const track = createStuntTrack(1), sim = new RoadSimulation(track, 'stunt'); let landed = false, airborne = 0;
  try {
   assert.equal(track.chunks[0].last, 220);
   assert.ok(track.samples[221].position.distanceTo(track.samples[220].position) > 30);
   sim.start();
   for (let i = 0; i < 120 * 30 && sim.phase === 'running'; i++) {
    const target = aim < 0 ? sim.position.z < -184 ? aim : sim.position.z < -150 ? -4 : 0 : sim.position.z < -174 ? aim : 0;
    sim.step(Math.max(-1, Math.min(1, (target - sim.position.x - sim.body.linvel().x * .5) * .4)));
    airborne = Math.max(airborne, sim.flightTime);
    if (sim.grounded && sim.sampleIndex > 220) { landed = true; break; }
   }
   assert.ok(landed, JSON.stringify({ aim, phase: sim.phase, position: sim.position }));
   const lane = track.chunks[aim < 0 ? 1 : aim === 0 ? 3 : 5];
   assert.ok(sim.sampleIndex >= lane.first && sim.sampleIndex <= lane.last);
   assert.ok(airborne > 1 && airborne < 4.2);
   assert.ok(sim.skipped > 0);
   if (aim > 0) {
    for (let i = 0; i < 120 * 50 && sim.phase === 'running'; i++) sim.step(Math.max(-1, Math.min(1, (20 - sim.position.x - sim.body.linvel().x * .4) * .6)));
    assert.equal(sim.phase, 'finished');
    const run = parsePublishedRun({ ...sim.snapshot(), name: 'Drop Test' }); assert.ok(run && await plausibleRoadRun(run));
   }
  } finally { sim.dispose(); }
 }
});

test('a physical full loop registers inverted contact, earns progress and can finish with or without rhythm', async () => {
 for (const rhythm of [false, true]) {
  const sim = new RoadSimulation(createStuntTrack(2), 'stunt'), drive = driver(sim, rhythm);
  let inverted = 0, lastLoopIndex = 0;
  try {
   sim.start();
   for (let i = 0; i < 120 * 80 && sim.phase === 'running'; i++) {
    drive();
    if (sim.sampleIndex >= sim.track.loop.first && sim.sampleIndex <= sim.track.loop.last) {
     lastLoopIndex = Math.max(lastLoopIndex, sim.sampleIndex);
     if (sim.grounded && sim.track.samples[sim.sampleIndex].normal.y < -.85) inverted++;
    }
   }
   assert.ok(inverted >= 5, JSON.stringify({ rhythm, inverted, lastLoopIndex }));
   assert.ok(lastLoopIndex > sim.track.loop.last - 10);
   assert.equal(sim.phase, 'finished');
   const run = parsePublishedRun({ ...sim.snapshot(), name: 'Loop Test' }); assert.ok(run && await plausibleRoadRun(run));
  } finally { sim.dispose(); }
 }
});

test('jumping from the inverted deck releases traction and launches away from its surface', () => {
 const sim = new RoadSimulation(createStuntTrack(2), 'stunt'), drive = driver(sim);
 try {
  sim.start(); let reached = false;
  for (let i = 0; i < 120 * 30 && sim.phase === 'running'; i++) { drive(); if (sim.grounded && sim.track.samples[sim.sampleIndex].normal.y < -.85) { reached = true; break; } }
  assert.ok(reached);
  const normal = sim.track.samples[sim.sampleIndex].normal.clone();
  assert.ok(sim.jump()); assert.ok(normal.dot(sim.body.linvel()) >= 5.99);
  sim.step(0);
  assert.ok(new Vector3().copy(sim.body.userForce()).length() < 1e-9, 'a jump must disable the local traction and motor');
  assert.ok(!sim.rollingOnRoad); assert.equal(sim.jumpCooldown, 6);
 } finally { sim.dispose(); }
});

test('slalom and narrow bridges can be finished with ordinary steering and rhythm', () => {
 for (const seed of [3, 4]) {
  const sim = new RoadSimulation(createStuntTrack(seed), 'stunt'), drive = driver(sim);
  try { sim.start(); for (let i = 0; i < 120 * 70 && sim.phase === 'running'; i++) drive(); assert.equal(sim.phase, 'finished'); assert.ok(sim.bestRhythm > 10); }
  finally { sim.dispose(); }
 }
});

test('the loop camera smoothly frames the inversion and resets for an ordinary road', () => {
 const track = createStuntTrack(2), rig = new LoopCamera(); let previous;
 for (let i = track.loop.first - 70; i <= track.loop.last + 60; i++) {
  const egg = track.samples[i].position, camera = egg.clone().add(new Vector3(0, 6.4, 12)), target = egg.clone().add(new Vector3(0, 0, -8));
  rig.apply(1 / 120, track, i, egg, camera, target);
  assert.ok(camera.toArray().every(Number.isFinite)); assert.ok(camera.distanceTo(egg) > 10); assert.ok(target.distanceTo(egg) < 10);
  if (previous) assert.ok(camera.distanceTo(previous) < 3);
  previous = camera;
 }
 const normal = createStuntTrack(4), camera = new Vector3(1,2,3), target = new Vector3(4,5,6);
 rig.apply(1/60, normal, 10, new Vector3(), camera, target); assert.equal(rig.amount, 0); assert.deepEqual(camera.toArray(), [1,2,3]);
});

test('fun roads retain their own boards and finite filter without affecting endless scores', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'egg-fun-')), store = createRoadRecordStore(directory);
 try {
  for (const { spec } of FUN_ROADS) store.submit('player', { code: roadCode(spec), name: 'Fun Test', score: 100, gates: 1, distance: 19, seconds: 10, finished: false });
  assert.equal(store.popular('finite').tracks.length, 6); assert.equal(store.popular('endless').tracks.length, 0);
  for (const { spec } of FUN_ROADS) { const board = store.read(roadCode(spec), 'player'); assert.equal(board.personal.score, 100); assert.equal(board.endlessBest, 0); }
 } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});


test('the speed plunge reaches 250 km/h and finishes through the braking valley with ordinary physics', async () => {
 for (const rhythm of [false, true]) {
  const sim = new RoadSimulation(createStuntTrack(5), 'stunt'), drive = driver(sim, rhythm);
  try {
   sim.start(); let belowFinish = false;
   for (let i = 0; i < 120 * 180 && sim.phase === 'running'; i++) {
    drive();
    if (sim.position.y < sim.track.samples.at(-1).position.y - 30) belowFinish = true;
   }
   assert.equal(sim.phase, 'finished', JSON.stringify({ rhythm, distance: sim.progress, reason: sim.endReason }));
   assert.ok(belowFinish, 'the uphill finish must not kill a rolling egg in the valley');
   assert.ok(sim.maxSpeed * 3.6 > 250, sim.maxSpeed);
   assert.equal(sim.world.gravity.y, -20);
   const velocity = sim.body.linvel();
   assert.equal(sim.snapshot().speed, Math.hypot(velocity.x, velocity.y, velocity.z));
   const run = parsePublishedRun({ ...sim.snapshot(), name: 'Speed Test' }); assert.ok(run && await plausibleRoadRun(run));
   sim.reset(); assert.equal(sim.maxSpeed, 0); assert.equal(sim.phase, 'ready');
  } finally { sim.dispose(); }
 }
});
