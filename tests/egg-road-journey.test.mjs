import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { createRoadTrack, hasRoadClearance } from "../src/features/EggRoad/track.ts";
import { initializePhysics, PHYSICS_STEP } from "../src/features/EggRoad/simulation.ts";
import { RoadJourney } from "../src/features/EggRoad/journey.ts";
import { flybyPose } from "../src/features/EggRoad/camera.ts";
import { createEggGeometry, createEggHull } from "../src/features/EggRoad/geometry.ts";
import { readRoadProgress, saveRoadProgress } from "../src/features/EggRoad/storage.ts";

await initializePhysics();

test("the collision hull contains the entire visible shell, including its tip", () => {
  const geometry = createEggGeometry();
  try {
    assert.deepEqual(createEggHull(), geometry.getAttribute("position").array);
  } finally { geometry.dispose(); }
});

test("procedural roads vary, repeat from their seed, and keep crossings clear", () => {
  const tutorial = createRoadTrack(1, 3);
  assert.deepEqual(tutorial.chunks[0].vertices, createRoadTrack(1, 991).chunks[0].vertices);
  const fingerprints = new Set();
  const turnDirections = new Set();
  for (const level of [2, 9, 1000]) for (let i = 0; i < 12; i++) {
    const road = createRoadTrack(level, Math.imul(i + 1, 2654435761) >>> 0);
    assert.ok(hasRoadClearance(road.samples));
    assert.ok(road.length > 600 && road.length < 2400);
    for (let j = 1; j < road.samples.length; j++) {
      const a = road.samples[j - 1], b = road.samples[j];
      assert.ok(b.position.y < a.position.y, "every generated section descends");
      assert.ok(a.tangent.dot(b.tangent) > 0.98, "no abrupt reversal");
      assert.ok(b.width >= 7.3);
    }
    fingerprints.add(road.length.toFixed(4));
    turnDirections.add(Math.sign(road.samples[100].position.x));
    if (i === 0) assert.deepEqual(road.chunks[0].vertices, createRoadTrack(level, road.seed).chunks[0].vertices);
  }
  assert.equal(fingerprints.size, 36);
  assert.equal(turnDirections.size, 2);
});

test("only a completed road advances; retry keeps its layout and practice restores the tutorial", () => {
  const journey = new RoadJourney();
  try {
    assert.equal(journey.advance(), false);
    const sim = journey.simulation;
    const finish = sim.track.samples.at(-6);
    sim.body.setTranslation(finish.position.clone().addScaledVector(finish.normal, 3), true);
    sim.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.start();
    for (let i = 0; i < 120; i++) sim.step(0);
    assert.equal(sim.phase, "finished");
    const checkpoint = journey.checkpoint();
    assert.deepEqual(journey.checkpoint(), checkpoint, "repeated result callbacks keep the same next seed");
    assert.equal(journey.advance(), true);
    assert.equal(journey.simulation.track.level, 2);
    assert.equal(journey.simulation.track.seed, checkpoint.seed);
    const course = journey.simulation.track;
    journey.simulation.start();
    for (let i = 0; i < 0.5 / PHYSICS_STEP; i++) journey.simulation.step(1);
    journey.simulation.reset();
    assert.equal(journey.simulation.track, course);
    assert.equal(journey.advance(), false);
    journey.practice();
    assert.equal(journey.simulation.track.level, 1);
    assert.equal(journey.simulation.phase, "ready");
  } finally { journey.dispose(); }
});

test("the opening overview fits the whole road on portrait and landscape screens", () => {
  for (const road of [createRoadTrack(), createRoadTrack(5, 92734)]) for (const aspect of [320/568, 390/844, 844/390, 16/9]) {
    const finish = road.samples[10].position.clone().add(new Vector3(0, 6.4, 12));
    const target = road.samples[10].position.clone().add(new Vector3(0, .2, -8));
    for (const time of [0, 0.2]) {
      const pose = flybyPose(road, time, aspect, 62, finish, target);
      const camera = new PerspectiveCamera(62, aspect, .1, pose.far);
      camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
      for (const sample of road.samples) for (const side of [-1, 1]) {
        const projected = sample.position.clone().addScaledVector(sample.right, side * sample.width / 2).project(camera);
        assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1);
      }
    }
    const last = flybyPose(road, 1, aspect, 62, finish, target);
    assert.ok(last.position.distanceTo(finish) < 1e-10);
    assert.ok(last.target.distanceTo(target) < 1e-10);
  }
});

test("local progress resumes its saved seed and replaying practice does not erase it", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) } });
  try {
    assert.deepEqual(readRoadProgress(), { level: 1, seed: 0 });
    saveRoadProgress({ level: 4, seed: 9823 });
    saveRoadProgress({ level: 2, seed: 712 });
    assert.deepEqual(readRoadProgress(), { level: 4, seed: 9823 });
    for (const value of ['invalid', '{"level":4,"seed":-1}', '{"level":999999,"seed":2}']) {
      values.set('egg_road_journey_v1', value);
      assert.deepEqual(readRoadProgress(), { level: 1, seed: 0 });
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage;
  }
});
