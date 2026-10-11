import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vector3, Quaternion } from 'three';
import { RoadSession } from '../src/features/EggRoad/session.ts';
import { createRoadTrack, hasRoadClearance } from '../src/features/EggRoad/track.ts';
import { createEndlessTrack, streamEndless, shiftEndless, joinRoadPart, partSeed, partLevel } from '../src/features/EggRoad/endless.ts';
import { packTrack, unpackTrack } from '../src/features/EggRoad/trackTransfer.ts';
import { RoadRenderer } from '../src/features/EggRoad/roadRenderer.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { RoadScoring } from '../src/features/EggRoad/scoring.ts';
import { dailyRoad, parseRoadCode, roadCode } from '../src/features/EggRoad/seed.ts';
import { roadHistory, bestRoadResult, saveRoadResult, markRoadPublished } from '../src/features/EggRoad/results.ts';
import { selectRoadAccount, readRoadProgress, saveRoadProgress, readSavedRoads, saveRoad } from '../src/features/EggRoad/storage.ts';
import { parsePublishedRun } from '../src/features/EggRoad/leaderboard.ts';
import { plausibleRoadRun } from '../src/server/roadValidation.ts';
import { createRoadRecordStore, RoadAccountChangedError } from '../src/server/roadRecords.ts';
import { RoadGhost, validGhost } from '../src/features/EggRoad/ghost.ts';
import { classifyRoadAir } from '../src/features/EggRoad/contact.ts';

await initializePhysics();
function storage() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; },
  } });
  return { values, restore() { selectRoadAccount(null); if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; } };
}
const result = (score = 100, code = 'EGG2-R-2-ABC') => ({ code, mode: 'seed', level: 2, score, gates: 1, distance: 19, seconds: 10,
  skipped: 0, bestSkip: 0, finished: false, breakdown: { gates: 100, edge: score - 100, speed: 0, rhythm: 0, drop: 0, shortcut: 0 } });

test('a run keeps its original owner and can complete exactly once; every restart creates a distinct ticket', () => {
  let owner = 'alpha', count = 0;
  const session = new RoadSession(() => ({ id: randomUUID(), owner, ordinal: ++count }));
  assert.equal(count, 0, 'constructing/rendering must not create an attempt');
  assert.equal(session.finish(), null);
  const first = session.start(); owner = 'beta';
  assert.equal(session.ticket, first, 'pause and resume preserve the ticket');
  assert.equal(session.finish().owner, 'alpha'); assert.equal(session.finish(), null);
  const next = session.start(); assert.notEqual(next.id, first.id); assert.equal(next.owner, 'beta');
});

test('legacy geometry and fixed-input physics match the pre-upgrade fixtures', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/egg-road-v1.json', import.meta.url)));
  for (const golden of fixtures.scenarios) {
    const track = createRoadTrack(golden.level, golden.seed), sim = new RoadSimulation(track);
    try {
      assert.equal(createHash('sha256').update(track.chunks[0].vertices).digest('hex'), golden.hash);
      sim.start(); for (let i = 0; i < 400; i++) { if (i === golden.jump) sim.jump(); sim.step(Math.sin(i / 65) * .3); }
      assert.equal(sim.phase, golden.phase); assert.equal(sim.score, golden.score); assert.equal(sim.gates, golden.gates);
      assert.ok(sim.position.distanceTo(new Vector3().fromArray(golden.position)) < .001);
      assert.ok(sim.rotation.angleTo(new Quaternion().fromArray(golden.rotation)) < .001);
    } finally { sim.dispose(); }
  }
});

test('new maps round-trip with their version, the tutorial is shorter/wider, and late levels still vary', () => {
  const classic = createRoadTrack(), tutorial = createRoadTrack(1, 0, 2);
  assert.ok(tutorial.length < classic.length / 2);
  assert.ok(Math.min(...tutorial.samples.map(s => s.width)) >= 10);
  assert.ok(hasRoadClearance(tutorial.samples));
  const code = roadCode({ mode: 'seed', level: 20, seed: 739, version: 2 });
  assert.deepEqual(parseRoadCode(code), { mode: 'seed', level: 20, seed: 739, version: 2 });
  assert.notDeepEqual(createRoadTrack(20, 739, 2).chunks[0].vertices, createRoadTrack(1000, 739, 2).chunks[0].vertices);
  assert.deepEqual(dailyRoad(new Date('2026-09-22T00:00:00Z')), dailyRoad(new Date('2026-09-22T23:59:59Z')));
  assert.notDeepEqual(dailyRoad(new Date('2026-09-22')), dailyRoad(new Date('2026-09-23')));
  for (const level of [2, 5, 13, 20, 1000]) for (let seed = 0; seed < 12; seed++) {
    const track = createRoadTrack(level, Math.imul(seed + 1, 2654435761) >>> 0, 2);
    assert.ok(hasRoadClearance(track.samples)); assert.ok(track.length > 500 && track.length < 2400);
    for (let i = 1; i < track.samples.length; i++) {
      assert.ok(track.samples[i].position.y < track.samples[i - 1].position.y);
      assert.ok(track.samples[i].tangent.dot(track.samples[i - 1].tangent) > .98);
    }
  }
});

test('prepared worker geometry and fallback generation produce identical seams and bounds', () => {
  const track = createEndlessTrack(739, 2), fallback = createEndlessTrack(739, 2);
  const part = track.endless.nextPart;
  const packed = packTrack(createRoadTrack(partLevel(part), partSeed(track.seed, part), 2));
  track.endless.prepared = { part, track: unpackTrack(structuredClone(packed)) };
  const progress = track.samples[track.chunks[0].last].distance + 1;
  streamEndless(track, progress); streamEndless(fallback, progress);
  assert.deepEqual(track.chunks.at(-1).vertices, fallback.chunks.at(-1).vertices);
  assert.equal(track.endless.prepared, undefined);
  for (const sample of track.samples) assert.ok(track.bounds.containsPoint(sample.position));
  const copy = unpackTrack(structuredClone(packTrack(track)));
  assert.deepEqual(copy.samples, track.samples); assert.deepEqual(copy.chunks, track.chunks);
});

test('streaming retains GPU objects and floating-origin shifts retain Rapier colliders', () => {
  const track = createEndlessTrack(88, 2), sim = new RoadSimulation(track, 'endless'), visuals = new RoadRenderer();
  try {
    visuals.sync(track);
    const old = new Map(visuals.chunks), buffers = track.chunks.map(chunk => chunk.vertices.slice());
    const handles = [...sim.roadColliders.keys()];
    sim.start(); sim.position.set(1300, 10, 0); sim.body.setTranslation(sim.position, true); sim.step(0);
    assert.deepEqual([...sim.roadColliders.keys()], handles);
    for (let i = 0; i < buffers.length; i++) assert.deepEqual(track.chunks[i].vertices, buffers[i]);
    visuals.sync(track);
    for (const [chunk, visual] of old) {
      assert.equal(visuals.chunks.get(chunk), visual);
      assert.ok(visual.group.position.equals(chunk.origin));
      const handle = [...sim.roadColliders].find(([, c]) => c === chunk)[0];
      assert.ok(new Vector3().copy(sim.world.getCollider(handle).translation()).distanceTo(chunk.origin) < .001);
    }
    streamEndless(track, track.samples[track.chunks[1].last].distance + 1); visuals.sync(track);
    for (const [chunk, visual] of old) if (track.chunks.includes(chunk)) assert.equal(visuals.chunks.get(chunk), visual);
    assert.equal(visuals.chunks.size, track.chunks.length);
    for (const sample of track.samples) assert.ok(track.bounds.containsPoint(sample.position));
  } finally { visuals.dispose(); sim.dispose(); }
});

test('a fully prepared section still joins after its anchor moved with the floating origin', () => {
  const track = createEndlessTrack(313, 2), fallback = createEndlessTrack(313, 2), part = track.endless.nextPart;
  const next = joinRoadPart(createRoadTrack(partLevel(part), partSeed(track.seed, part), 2), track.samples.at(-1));
  track.endless.prepared = { part, track: unpackTrack(structuredClone(packTrack(next))), fitted: true };
  const shift = new Vector3(256, -256, 0); shiftEndless(track, shift); shiftEndless(fallback, shift);
  const distance = track.samples[track.chunks[0].last].distance + 1;
  streamEndless(track, distance); streamEndless(fallback, distance);
  assert.equal(track.samples.length, fallback.samples.length);
  for (let i = 0; i < track.samples.length; i++) assert.ok(track.samples[i].position.distanceTo(fallback.samples[i].position) < 1e-9);
  const chunk = track.chunks.at(-1), other = fallback.chunks.at(-1);
  for (let i = 0; i < chunk.vertices.length; i += 3) {
    const a = new Vector3().fromArray(chunk.vertices, i).add(chunk.origin), b = new Vector3().fromArray(other.vertices, i).add(other.origin);
    assert.ok(a.distanceTo(b) < .0001);
  }
});

test('a shortcut and a high drop appear in one notice and version two rewards risk without exponential rhythm', () => {
  const old = new RoadScoring(), score = new RoadScoring(2);
  const contact = { distance: 180, gates: 10, speed: 22, edgeGap: 3, chain: 10, drop: 24, skipped: 9, seconds: 4 };
  old.contact(contact); score.contact(contact);
  assert.deepEqual(score.notice.parts, [{ kind: 'shortcut', points: 900 }, { kind: 'drop', points: 120 }]);
  assert.equal(score.notice.points, 1020); assert.equal(score.totals.rhythm, 8);
  assert.ok(score.totals.shortcut > old.totals.shortcut * 2);
  assert.equal(score.total, Object.values(score.breakdown()).reduce((sum, n) => sum + n, 0));
  const before = score.total; score.contact(contact); assert.equal(score.total, before);
});

test('full map bests survive weaker retries, reload reads and switching accounts', () => {
  const browser = storage();
  try {
    selectRoadAccount('Alpha');
    const best = saveRoadResult({ id: randomUUID(), owner: 'alpha' }, result(500)).run;
    for (let i = 0; i < 15; i++) saveRoadResult({ id: randomUUID(), owner: 'alpha' }, result(100 + i));
    assert.equal(bestRoadResult(best.result.code).id, best.id);
    assert.ok(roadHistory().length <= 13); assert.equal(bestRoadResult(best.result.code).result.breakdown.edge, 400);
    markRoadPublished(best); assert.equal(bestRoadResult(best.result.code).published, true);
    selectRoadAccount('Beta'); assert.equal(bestRoadResult(best.result.code), null);
    assert.equal(bestRoadResult(best.result.code, 'alpha').id, best.id);
    saveRoadProgress({ level: 8, seed: 123, version: 2 }, 'alpha'); saveRoad('EGG2-R-2-ABC');
    assert.equal(readRoadProgress().level, 1); assert.deepEqual(readSavedRoads(), ['EGG2-R-2-ABC']);
    selectRoadAccount('Alpha'); assert.equal(readRoadProgress().level, 8); assert.deepEqual(readSavedRoads(), []);
  } finally { browser.restore(); }
});

test('record plausibility rejects impossible durations, finite distances and premature finishes', async () => {
  const good = { ...result(), name: 'Review' }; assert.ok(parsePublishedRun(good)); assert.ok(await plausibleRoadRun(good));
  assert.equal(parsePublishedRun({ ...good, score: 100000000, gates: 1000000, distance: 18000000, seconds: .1, finished: true }), null);
  assert.equal(await plausibleRoadRun({ ...good, distance: 100000, seconds: 1000 }), false);
  assert.equal(await plausibleRoadRun({ ...good, finished: true }), false);
  for (const version of [1, 2]) {
    const track = createRoadTrack(5, 739, version), distance = track.length - 10, gates = Math.floor(distance / 18);
    const payload = { ...good, code: `EGG${version}-R-5-KJ`, distance, gates, score: gates * 100, seconds: 40, finished: true,
      breakdown: { ...good.breakdown, gates: gates * 100 } };
    assert.ok(parsePublishedRun(payload)); assert.ok(await plausibleRoadRun(payload));
  }
});

test('server preserves classic records and separates current rules, even when old outboxes arrive later', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'road-upgrade-')), store = createRoadRecordStore(directory);
  try {
    store.register('guest', 'Alpha', 'test-password', 'test-recovery', 'test-session');
    const player = store.credentials('Alpha').player;
    const run = (score, roadRules) => ({ id: randomUUID(), game: 'road', score: String(score), peak: String(score), seconds: 20, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0, roadRules });
    store.portalResult(player, run(9000, undefined));
    const current = run(300, 2); store.portalResult(player, current); store.portalResult(player, current);
    store.portalResult(player, run(12000, undefined));
    const stat = store.ownProfile(player).stats.find(s => s.game === 'road');
    assert.equal(stat.best, '300'); assert.equal(stat.runs, 1); assert.equal(stat.roadRules, 2);
    assert.equal(store.ownProfile(player).classicRoadBest, '12000');
    store.submit(player, { ...result(), name: 'Alpha', expectedOwner: 'alpha' });
    assert.throws(() => store.submit(player, { ...result(), name: 'Alpha', expectedOwner: null }), RoadAccountChangedError);
    assert.ok(store.popular('finite').tracks.some(track => track.code === result().code));
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('ghost replay interpolates a saved run, respects ownership and follows floating-origin shifts', () => {
  const browser = storage();
  try {
    const ghost = new RoadGhost(); ghost.enabled = true; ghost.begin('EGG2-R-2-ABC', 'alpha');
    const rotation = new Quaternion(), zero = new Vector3();
    for (let i = 0; i < 20; i++) ghost.sample(i / 5, new Vector3(i * 2, 0, 0), rotation, zero);
    ghost.finish(result(200)); ghost.begin('EGG2-R-2-ABC', 'alpha');
    const position = new Vector3(); assert.equal(ghost.pose(.1, position, rotation), true); assert.equal(position.x, 1);
    ghost.sample(.2, zero, rotation, new Vector3(256, 0, 0)); ghost.pose(.3, position, rotation); assert.ok(Math.abs(position.x + 253) < 1e-6);
    ghost.begin('EGG2-R-2-ABC', 'beta'); assert.equal(ghost.pose(.1, position, rotation), false);
    assert.equal(validGhost({ schema: 1, code: 'x', score: 1, frames: [[0, NaN]] }, 'x'), false);
  } finally { browser.restore(); }
});

test('contact grace never mistakes a rescue jump for road recharge', () => {
  assert.equal(classifyRoadAir(true, .5, .3, false).nearRoad, true);
  assert.equal(classifyRoadAir(true, .5, .3, true).nearRoad, false);
  assert.equal(classifyRoadAir(true, 2, .8, false).ordinaryHop, true);
  assert.equal(classifyRoadAir(true, 2, 1.3, false).ordinaryHop, false);
});

test('air steering on new roads follows reversed travel instead of the departed road', () => {
  for (const version of [1, 2]) {
    const sim = new RoadSimulation(createRoadTrack(1, 0, version));
    try {
      sim.start(); sim.jump(); sim.body.setTranslation({ x: 300, y: 100, z: 300 }, true);
      sim.body.setLinvel({ x: 0, y: -5, z: 10 }, true); sim.step(1);
      assert.ok(version === 2 ? sim.body.userForce().x < -10 : sim.body.userForce().x > 10);
    } finally { sim.dispose(); }
  }
});
