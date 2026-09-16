import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { createRoadTrack, GATE_SPACING } from "../src/features/EggRoad/track.ts";
import { FLIGHT_LIMIT, initializePhysics, PHYSICS_STEP, RoadSimulation } from "../src/features/EggRoad/simulation.ts";

await initializePhysics();
const track = createRoadTrack();
const advance = (sim, seconds, input = 0) => {
  for (let i = 0; i < Math.round(seconds / PHYSICS_STEP); i++) sim.step(input);
};

test("the egg is an asymmetric convex rigid body with shape-derived mass and inertia", () => {
  const sim = new RoadSimulation(track);
  try {
    assert.equal(sim.collider.shapeType(), RAPIER.ShapeType.ConvexPolyhedron);
    assert.ok(sim.body.localCom().y < -0.05, "the broad end shifts the centre of mass");
    const inertia = sim.body.principalInertia();
    assert.ok(Math.max(inertia.x, inertia.y, inertia.z) / Math.min(inertia.x, inertia.y, inertia.z) > 1.2);
    const initialRotation = new Quaternion().copy(sim.body.rotation());
    sim.start(); advance(sim, 2);
    assert.ok(initialRotation.angleTo(new Quaternion().copy(sim.body.rotation())) > 0.2);
    assert.ok(Math.abs(sim.position.x) > 0.05, "unassisted motion reflects the asymmetrical shell");
  } finally { sim.dispose(); }
});

test("rolling and bouncing on the run-in count as road contacts instead of a fatal free fall", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start(); advance(sim, FLIGHT_LIMIT + 0.3);
    assert.equal(sim.phase, "running");
    assert.ok(sim.score >= 2);
    assert.ok(sim.airTime < 0.5);
    assert.ok(sim.position.z < 0);
  } finally { sim.dispose(); }
});

test("a lower-road landing resets flight allowance and awards skipped gates only once", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start(); advance(sim, 0.5);
    const target = track.samples[300];
    sim.body.setTranslation(target.position.clone().addScaledVector(target.normal, 5), true);
    sim.body.setLinvel(target.tangent.clone().multiplyScalar(7), true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    advance(sim, 1.8);
    assert.equal(sim.phase, "running");
    assert.ok(sim.score >= Math.floor(target.distance / GATE_SPACING));
    assert.ok(sim.skipped >= 10);
    assert.ok(sim.airTime < 0.3);
    const previousSkipped = sim.skipped;
    const previousScore = sim.score;
    // Revisit the same earlier piece of road; proximity to another coil is not progress.
    sim.body.setTranslation(target.position.clone().addScaledVector(target.normal, 2), true);
    sim.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    advance(sim, 0.65);
    assert.equal(sim.skipped, previousSkipped);
    assert.equal(sim.score, previousScore);
  } finally { sim.dispose(); }
});

test("CCD catches a fast falling egg on a thin road surface", () => {
  const sim = new RoadSimulation(track);
  try {
    const surface = track.samples[20];
    sim.body.setTranslation(surface.position.clone().add(new Vector3(0, 20, 0)), true);
    sim.body.setLinvel({ x: 0, y: -160, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.start();
    let landed = false;
    for (let i = 0; i < 80; i++) {
      sim.step(0);
      if (sim.grounded) { landed = true; break; }
    }
    assert.ok(landed);
    assert.ok(sim.position.y > surface.position.y - 0.1);
  } finally { sim.dispose(); }
});

test("a fall away from the road ends the run without awarding gates", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.body.setTranslation({ x: 500, y: 50, z: 500 }, true);
    sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.start(); advance(sim, FLIGHT_LIMIT + 0.1);
    assert.equal(sim.phase, "over");
    assert.equal(sim.score, 0);
    assert.equal(sim.skipped, 0);
  } finally { sim.dispose(); }
});

test("landing on the end of the course finishes the run and freezes its result", () => {
  const sim = new RoadSimulation(track);
  try {
    const finish = track.samples.at(-6);
    sim.body.setTranslation(finish.position.clone().addScaledVector(finish.normal, 3), true);
    sim.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.start(); advance(sim, 1);
    assert.equal(sim.phase, "finished");
    assert.equal(sim.snapshot().finished, true);
    assert.ok(sim.score >= Math.floor((track.length - 12) / GATE_SPACING));
    const result = sim.snapshot();
    advance(sim, 5, -1);
    assert.deepEqual(sim.snapshot(), result);
  } finally { sim.dispose(); }
});

test("pause freezes the simulation and restart clears the entire previous run", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start(); advance(sim, 2);
    sim.pause();
    const position = sim.position.toArray();
    const snapshot = sim.snapshot();
    advance(sim, 10, 1);
    assert.deepEqual(sim.position.toArray(), position);
    assert.deepEqual(sim.snapshot(), snapshot);
    sim.resume(); advance(sim, 0.3, 1);
    assert.notDeepEqual(sim.position.toArray(), position);
    sim.reset();
    assert.equal(sim.phase, "ready");
    assert.equal(sim.score, 0);
    assert.equal(sim.seconds, 0);
    assert.equal(sim.skipped, 0);
    assert.equal(sim.airTime, 0);
    sim.start(); advance(sim, 2);
    assert.equal(sim.phase, "running");
    assert.ok(sim.score >= 1);
  } finally { sim.dispose(); }
});
