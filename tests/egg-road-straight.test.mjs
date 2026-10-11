import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STRAIGHT_ROAD, parseRoadCode, roadCode } from '../src/features/EggRoad/seed.ts';
import { createTrackForSpec } from '../src/features/EggRoad/trackSpec.ts';
import { packTrack, unpackTrack } from '../src/features/EggRoad/trackTransfer.ts';
import { RoadJourney } from '../src/features/EggRoad/journey.ts';
import { initializePhysics } from '../src/features/EggRoad/simulation.ts';
import { SteeringRamp } from '../src/features/EggRoad/controls.ts';
import { plausibleRoadRun } from '../src/server/roadValidation.ts';
import { parsePublishedRun } from '../src/features/EggRoad/leaderboard.ts';
import { createRoadRecordStore } from '../src/server/roadRecords.ts';

await initializePhysics();
const code = 'EGG3-S-8-0';

test('the straight road has its own canonical share code without reinterpreting R/E seeds', () => {
  assert.equal(roadCode(STRAIGHT_ROAD), code);
  for (const input of [code, code.toLowerCase(), `https://egg.ilyamedve.dev/ru/play/?road=${code}`]) assert.deepEqual(parseRoadCode(input), STRAIGHT_ROAD);
  for (const input of ['EGG1-S-8-0', 'EGG2-S-8-0', 'EGG3-S-1-0', 'EGG3-S-8-1']) assert.equal(parseRoadCode(input), null);
  assert.equal(parseRoadCode('EGG3-R-8-0').mode, 'seed');
  assert.equal(parseRoadCode('EGG3-E-2-0').mode, 'endless');
});

test('the 5km road stays straight, uniformly wide and smooth through worker transfer', () => {
  const track = createTrackForSpec(STRAIGHT_ROAD), copy = unpackTrack(packTrack(track));
  assert.deepEqual(copy.samples, track.samples);
  assert.deepEqual(copy.chunks, track.chunks);
  assert.equal(copy.length, 5000);
  assert.equal(copy.endless, undefined);
  assert.equal(copy.variations, undefined);
  for (const [i, sample] of copy.samples.entries()) {
    assert.equal(sample.position.x, 0);
    assert.equal(sample.width, 10.6);
    assert.equal(sample.distance, i);
    assert.ok(Math.abs(sample.tangent.y / sample.tangent.z - .125) < 1e-12);
    assert.ok(Math.abs(sample.normal.dot(sample.tangent)) < 1e-12);
    assert.deepEqual(sample.tangent, copy.samples[0].tangent);
    if (i) assert.ok(Math.abs(sample.position.distanceTo(copy.samples[i-1].position) - 1) < 1e-9);
  }
});

test('ordinary steering can finish the full straight road with rhythm, then retry the same code', async () => {
  const journey = new RoadJourney(STRAIGHT_ROAD), sim = journey.simulation, ramp = new SteeringRamp();
  let target = .65, input = 0;
  try {
    sim.start();
    for (let i = 0; i < 120 * 300 && sim.phase === 'running'; i++) {
      const offset = sim.position.x, lateral = sim.body.linvel().x;
      // React every 150 ms, like a player correcting their position and drift.
      if (i % 18 === 0) {
        if ((target > 0 && offset > target) || (target < 0 && offset < target)) target = -target;
        const correction = target - offset - lateral * .25;
        input = Math.abs(correction) < .15 ? 0 : Math.sign(correction);
      }
      sim.step(ramp.step(1 / 120, input));
    }
    assert.equal(sim.phase, 'finished', JSON.stringify({ phase: sim.phase, distance: sim.progress, seconds: sim.seconds }));
    assert.ok(sim.maxSpeed * 3.6 > 170, String(sim.maxSpeed));
    assert.ok(sim.bestRhythm > 130, String(sim.bestRhythm));
    const result = sim.snapshot();
    assert.equal(result.code, code);
    assert.equal(journey.checkpoint(), null);
    const run = parsePublishedRun({ ...result, name: 'Straight Test' });
    assert.ok(run);
    assert.ok(await plausibleRoadRun(run));
    assert.equal(await plausibleRoadRun({ ...run, distance: 100, finished: true }), false);
    assert.equal(await plausibleRoadRun({ ...run, distance: 5010 }), false);
    journey.retry();
    assert.equal(sim.phase, 'ready');
    assert.equal(sim.snapshot().code, code);
  } finally { journey.dispose(); }
});

test('straight records use their own board and appear among finite roads, with ordinary seeds unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egg-straight-')), store = createRoadRecordStore(directory);
  const run = { name: 'Straight Test', score: 100, gates: 1, distance: 19, seconds: 10, finished: false };
  try {
    store.submit('player', { ...run, code });
    store.submit('player', { ...run, code: 'EGG3-R-8-0', score: 200 });
    assert.equal(store.read(code, 'player').personal.score, 100);
    assert.equal(store.read('EGG3-R-8-0', 'player').personal.score, 200);
    assert.equal(store.read(code, 'player').endlessBest, 0);
    assert.deepEqual(store.popular('finite').tracks.map(t => t.code), ['EGG3-R-8-0', code]);
    assert.equal(store.popular('endless').tracks.length, 0);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
