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

test("ordinary rolling hops do not flash the find-road warning", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start();
    let warnings = 0;
    for (let i = 0; i < 360; i++) { sim.step(0); warnings += Number(sim.snapshot().airborne); }
    assert.equal(sim.phase, "running");
    assert.ok(sim.score >= 1);
    assert.equal(warnings, 0);
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

test("falling and bouncing vertically do not masquerade as fast travel on the HUD", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start(); advance(sim, .5);
    const surface = track.samples[20];
    sim.body.setTranslation(surface.position.clone().addScaledVector(surface.normal, 12), true);
    sim.body.setLinvel({ x: 0, y: -25, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.step(0);
    assert.ok(Math.abs(sim.body.linvel().y) > 25, "the egg really is falling at over 90 km/h");
    assert.ok(sim.snapshot().speed < 1, "almost no travel must show almost no speed");
    sim.body.setLinvel({ x: 0, y: 25, z: 0 }, true);
    sim.body.setAngvel({ x: 25, y: 20, z: 15 }, true);
    assert.equal(sim.snapshot().speed, 0, "vertical bounce and spinning in place are not travel");
    sim.body.setLinvel({ x: 3, y: 25, z: -4 }, true);
    assert.equal(sim.snapshot().speed, 5, "forward and sideways motion still contribute");
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

test("one ground jump lifts the real egg, preserves its spin, freezes rhythm and recharges only on retry", () => {
  const sim = new RoadSimulation(track);
  try {
    assert.equal(sim.jump(), false, "cannot spend a jump before the run");
    sim.start();
    while (!sim.grounded && sim.seconds < 1) sim.step(0);
    assert.ok(sim.grounded);
    sim.rhythm.charge = .7; sim.rhythm.chain = 4;
    const before = { ...sim.body.linvel() }, spin = { ...sim.body.angvel() }, startY = sim.position.y;
    assert.equal(sim.jump(), true);
    const boosted = { ...sim.body.linvel() };
    assert.ok(boosted.y >= 6); assert.equal(boosted.x, before.x); assert.equal(boosted.z, before.z);
    assert.deepEqual({ ...sim.body.angvel() }, spin);
    assert.equal(sim.jump(), false);
    assert.equal(sim.snapshot().jumpAvailable, false);
    advance(sim, .2, -1);
    assert.ok(sim.position.y > startY + .5, "a real upward flight, not a HUD effect");
    assert.equal(sim.rhythm.charge, .7); assert.equal(sim.rhythm.chain, 4);
    assert.equal(sim.snapshot().rhythmCue.state, "air");
    sim.pause(); assert.equal(sim.jump(), false); sim.resume();
    let landed = false;
    for (let i = 0; i < 156; i++) { sim.step(0); landed ||= sim.grounded; }
    assert.ok(landed, "the short rescue jump can land back on the opening road");
    assert.equal(sim.jump(), false, "landing does not recharge it");
    sim.reset(); sim.start(); assert.equal(sim.jump(), true);
  } finally { sim.dispose(); }
});

test("an air jump arrests a fast fall and gives a late rescue time to work, once", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.start(); sim.body.setTranslation({ x: 500, y: 300, z: 500 }, true);
    sim.body.setLinvel({ x: 3, y: -60, z: -4 }, true);
    sim.flightTime = FLIGHT_LIMIT - .05;
    sim.step(0);
    assert.equal(sim.grounded, false);
    const before = { ...sim.body.linvel() };
    assert.equal(sim.jump(), true);
    assert.ok(sim.body.linvel().y > 0);
    assert.equal(sim.body.linvel().x, before.x); assert.equal(sim.body.linvel().z, before.z);
    assert.ok(sim.snapshot().flightLeft >= .99);
    advance(sim, .5);
    assert.equal(sim.phase, "running"); assert.equal(sim.jump(), false);
    advance(sim, .7);
    assert.equal(sim.phase, "over"); assert.equal(sim.jump(), false);
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

test("road sides and underside block the shell, including a fast rim-only landing", () => {
  const sim = new RoadSimulation(track);
  try {
    const surface = track.samples[20];
    const road = sim.world.getCollider([...sim.roadColliders.keys()][0]);
    for (const side of [-1, 1]) {
      const origin = surface.position.clone().addScaledVector(surface.right, side * (surface.width / 2 + 2)).addScaledVector(surface.normal, -0.2);
      const hit = road.castRay(new RAPIER.Ray(origin, surface.right.clone().multiplyScalar(-side)), 4, true);
      assert.ok(hit > 1.9 && hit < 2.1, "both visible side walls have physical faces");
    }
    const below = surface.position.clone().addScaledVector(surface.normal, -2);
    const underside = road.castRay(new RAPIER.Ray(below, surface.normal), 4, true);
    assert.ok(underside > 1.5 && underside < 1.7);
    sim.body.setTranslation(surface.position.clone().addScaledVector(surface.right, surface.width / 2 + 0.65).addScaledVector(surface.normal, 10), true);
    sim.body.setLinvel({ x: 0, y: -140, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.start();
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      sim.step(0);
      sim.world.contactPair(sim.collider, road, m => {
        for (let j = 0; j < m.numContacts(); j++) if (m.contactDist(j) < 0.025) hit = true;
      });
    }
    assert.ok(hit, "the protruding shell catches the edge even with its centre outside");
    assert.ok(sim.position.y > surface.position.y - 0.1, "CCD catches the rim before the shell tunnels through");
  } finally { sim.dispose(); }
});

test("well-timed rocking gives real extra speed; tapping rapidly does not charge it", () => {
  const run = cadence => {
    const sim = new RoadSimulation(track);
    try {
      sim.start();
      let warnings = 0;
      for (let i = 0; i < 300; i++) {
        const t = i * PHYSICS_STEP;
        // A half stroke starts a centred oscillation from rest.
        const input = cadence ? (t < cadence / 2 ? 1 : (Math.floor((t - cadence / 2) / cadence) % 2 === 0 ? -1 : 1)) : 0;
        sim.step(input);
        warnings += Number(sim.snapshot().airborne);
      }
      return { charge: sim.rhythm.charge, speed: sim.snapshot().speed, distance: 21.6 - sim.position.z, warnings };
    } finally { sim.dispose(); }
  };
  const straight = run(0), rocking = run(0.45), tapping = run(0.08);
  assert.ok(rocking.charge > 0.5);
  assert.ok(rocking.speed > straight.speed * 1.2);
  assert.ok(rocking.distance > straight.distance + 5);
  assert.equal(tapping.charge, 0);
  assert.equal(straight.warnings + rocking.warnings + tapping.warnings, 0);
});

test("steering from the road position alone builds useful rhythm with no timing cue", () => {
  const sim = new RoadSimulation(track), straight = new RoadSimulation(track);
  try {
    sim.start(); straight.start();
    let target = .65, input = 0, warnings = 0;
    for (let i = 0; i < 360; i++) {
      const sample = sim.track.samples[sim.sampleIndex];
      const side = sim.position.clone().sub(sample.position).dot(sample.right);
      const lateral = new Vector3().copy(sim.body.linvel()).dot(sample.right);
      if ((target > 0 && side > target) || (target < 0 && side < target)) target = -target;
      // React every 150 ms to position and drift, never to rhythm or elapsed stroke time.
      if (i % 18 === 0) {
        const correction = target - side - lateral * .25;
        input = Math.abs(correction) < .15 ? 0 : Math.sign(correction);
      }
      sim.step(input); straight.step(0); warnings += Number(sim.snapshot().airborne);
    }
    assert.equal(warnings, 0);
    assert.ok(sim.rhythm.chain >= 3 && sim.rhythm.charge > .6);
    assert.ok(sim.snapshot().speed > straight.snapshot().speed * 1.2);
    assert.ok(sim.scoring.totals.rhythm > 20, "ordinary corrections earn real points on the road");
  } finally { sim.dispose(); straight.dispose(); }
});

test("the flyby and its pause keep the egg frozen until the descent starts", () => {
  const sim = new RoadSimulation(track);
  try {
    sim.beginIntro();
    const initial = sim.position.toArray();
    advance(sim, 5, 1);
    assert.deepEqual(sim.position.toArray(), initial);
    assert.equal(sim.seconds, 0);
    sim.pause(); sim.resume();
    assert.equal(sim.phase, "intro");
    sim.start(); advance(sim, 0.5);
    assert.notDeepEqual(sim.position.toArray(), initial);
  } finally { sim.dispose(); }
});
