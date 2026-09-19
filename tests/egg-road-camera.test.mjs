import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { CameraLook, ChaseHeading, ChaseRig, MapOrbit, lookDirection, orientationLook, overviewPose } from "../src/features/EggRoad/camera.ts";
import { createRoadTrack } from "../src/features/EggRoad/track.ts";
import { RollRhythm } from "../src/features/EggRoad/rhythm.ts";

test('a sudden 180 degree reversal follows a bounded, continuous arc even with noisy backwards motion', () => {
  const road = new Vector3(0, 0, -1), results = [];
  for (const fps of [30, 60, 120]) {
    const heading = new ChaseHeading(); heading.reset(road);
    let travelled = 0;
    for (let i = 0; i < fps * 5; i++) {
      const before = heading.direction.clone();
      heading.step(1/fps, road, { x: i%2 ? .01 : -.01, z: 20 }, true);
      const turn = before.angleTo(heading.direction); travelled += turn;
      assert.ok(Number.isFinite(turn) && turn <= 1.4/fps + 1e-6);
      assert.ok(Math.abs(heading.direction.length() - 1) < 1e-10, 'no zero vector at the halfway point');
    }
    assert.ok(heading.direction.z > .999, 'a sustained reversal is eventually followed');
    assert.ok(travelled > 3.1 && travelled < 3.3, 'noise must not make the camera oscillate or take extra turns');
    results.push(heading.direction.clone());
  }
  assert.ok(results[0].angleTo(results[2]) < .01);
});

test('brief reversals and low-speed jitter are ignored; a hard landing steadies the view before following the road', () => {
  const forward = new Vector3(0, 0, -1), road = new Vector3(1, 0, 0), heading = new ChaseHeading();
  heading.reset(forward);
  for (let i = 0; i < 12; i++) heading.step(1/60, forward, { x: 0, z: 15 }, true);
  for (let i = 0; i < 60; i++) heading.step(1/60, forward, { x: 1, z: i%2 ? 1 : -1 }, true);
  assert.ok(heading.direction.angleTo(forward) < 1e-9);
  heading.landed();
  for (let i = 0; i < 12; i++) heading.step(1/60, road, { x: -25, z: 0 }, true);
  assert.ok(heading.direction.angleTo(forward) < 1e-9, 'the impact does not immediately swing the view');
  for (let i = 0; i < 40; i++) heading.step(1/60, road, { x: -25, z: 0 }, true);
  assert.ok(heading.direction.x > .2, 'the camera chooses the landed road instead of the rebound');
});

test('the camera orbits outside the egg through reversals, hard bounces and origin rebasing', () => {
  const rig = new ChaseRig(), egg = new Vector3(), forward = new Vector3(0, 0, -1);
  rig.reset(egg, forward);
  const backward = forward.clone().negate();
  let previous = rig.position.clone();
  for (let i = 0; i < 180; i++) {
    rig.step(1/60, egg, backward, 0);
    assert.ok(Math.hypot(rig.position.x, rig.position.z) > 11.99, 'an orbit must not cut through the egg');
    assert.ok(previous.clone().setY(0).angleTo(rig.position.clone().setY(0)) <= 2.4/60 + 1e-6);
    previous.copy(rig.position);
  }
  for (const y of [-30, -60, -20, 20, 0]) {
    egg.y = y; rig.step(1/60, egg, backward, 0);
    assert.ok(rig.position.y >= egg.y + 4.39, 'lag after an impact cannot put the camera under the egg');
  }
  const shift = new Vector3(1024, -768, 512), position = rig.position.clone(), target = rig.target.clone();
  rig.shift(shift);
  assert.ok(rig.position.distanceTo(position.sub(shift)) < 1e-9);
  assert.ok(rig.target.distanceTo(target.sub(shift)) < 1e-9);
});

test('manual overview rotates both axes, stops auto-spin, resets smoothly and keeps the whole road in frame', () => {
  const orbit = new MapOrbit(); orbit.grab();
  const initial = { yaw: orbit.yaw, pitch: orbit.pitch };
  orbit.drag(100, 80);
  for (let i = 0; i < 120; i++) orbit.step(1/60);
  assert.ok(orbit.yaw < initial.yaw - .7 && orbit.pitch > initial.pitch + .4);
  const settled = orbit.yaw;
  for (let i = 0; i < 180; i++) orbit.step(1/60);
  assert.ok(Math.abs(orbit.yaw - settled) < 1e-6, 'release leaves the chosen view in place');
  orbit.restore(); const before = orbit.yaw; orbit.step(1/60);
  assert.ok(Math.abs(orbit.yaw - before) < .04, 'reset does not snap to the initial angle');
  const track = createRoadTrack(3, 129);
  for (const aspect of [320/568, 844/390]) for (const [dx, dy] of [[200, -1000], [-390, 1000], [1000, 0]]) {
    orbit.grab(); orbit.drag(dx, dy);
    for (let i = 0; i < 240; i++) orbit.step(1/60);
    const pose = overviewPose(track, 0, aspect, 62, orbit);
    const camera = new PerspectiveCamera(62, aspect, .1, pose.far);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    for (const sample of track.samples) for (const side of [-1, 1]) {
      const point = sample.position.clone().addScaledVector(sample.right, side * sample.width / 2).project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
    }
  }
});

test("look controls are bounded, smooth, and return to the forward view", () => {
  const look = new CameraLook(() => {});
  look.setManual(10, -10); look.step(.1);
  assert.ok(look.x > 0 && look.x < .04 && look.y < 0 && look.y > -1, "a short gesture only peeks sideways");
  for (let i = 0; i < 240; i++) look.step(1/60);
  const facing = lookDirection(new Vector3(0, 0, -1), look.x);
  assert.ok(facing.z > .9 && facing.x < -.3, "manual look reaches past the rear view to 200 degrees");
  const left = lookDirection(new Vector3(0, 0, -1), -1);
  assert.ok(left.z > .9 && left.x > .3, "the same range is available to the left");
  for (const side of [-1, 1]) {
    const rear = lookDirection(new Vector3(0, 0, -1), side * .9);
    assert.ok(rear.z > .999 && Math.abs(rear.x) < 1e-9, "180 degrees looks straight behind the egg");
  }
  look.setManual(0, 0);
  for (let i = 0; i < 240; i++) look.step(1/60);
  assert.ok(Math.abs(look.x) < 1e-5 && Math.abs(look.y) < 1e-5);
  for (let i = 0; i < 240; i++) look.step(1/60, -1);
  assert.ok(look.x < -.99, "keyboard has the same full range");
  look.recenter(); assert.equal(look.x, 0);
});

test("looking further turns more slowly, remains gentle on release and behaves consistently across frame rates", () => {
  const profiles = [];
  for (const fps of [60, 120]) {
    const look = new CameraLook(() => {}), profile = [];
    look.setManual(1, 0);
    for (let i = 0; i < fps * 3; i++) {
      const before = look.x; look.step(1 / fps);
      assert.ok(Math.abs(look.x - before) * 200 <= 130 / fps + 1e-9, "rotation never snaps");
      profile.push(look.x);
    }
    const early = profile[fps] - profile[fps / 2];
    const late = profile[2.5 * fps] - profile[2 * fps];
    assert.ok(late < early * .7, "speed noticeably drops toward the rear");
    look.setManual(0, 0);
    for (let i = 0; i < fps; i++) {
      const before = look.x; look.step(1 / fps);
      assert.ok(before - look.x <= .65 / fps + 1e-9, "release also has a speed limit");
    }
    profiles.push(profile[fps - 1]);
  }
  assert.ok(Math.abs(profiles[0] - profiles[1]) < .005);
});

test("tilt stays relative to the held position and follows screen rotation", () => {
  assert.deepEqual(orientationLook(45, 5, 45, 5, 0), { x: 0, y: 0 });
  assert.equal(orientationLook(45, 29, 45, 5, 0).x, 1);
  assert.ok(Math.abs(orientationLook(69, 5, 45, 5, 90).x - 1) < 1e-9);
  assert.ok(Math.abs(orientationLook(21, 5, 45, 5, 270).x - 1) < 1e-9);
  assert.ok(Math.abs(orientationLook(-179, 0, 179, 0, 0).y) < .1, "wrapping the device angle must not snap the view");
});

test("gyro activation handles denial, missing readings, recentering, and late permission after disposal", async () => {
  const descriptors = new Map(['window', 'DeviceOrientationEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  const device = new EventTarget();
  Object.assign(device, { isSecureContext: true, screen: { orientation: { angle: 0 } } });
  const states = [];
  const look = new CameraLook(state => states.push(state));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: device });
  let permission = async () => 'denied';
  Object.defineProperty(globalThis, 'DeviceOrientationEvent', { configurable: true, value: { requestPermission: () => permission() } });
  const reading = (beta, gamma) => {
    const event = new Event('deviceorientation');Object.assign(event,{beta,gamma});device.dispatchEvent(event);
  };
  try {
    await look.enableGyro(); assert.equal(look.gyroState, 'unavailable');
    permission = async () => 'granted';
    await look.enableGyro(); assert.equal(look.gyroState, 'waiting');
    reading(null, null); assert.equal(look.gyroState, 'waiting');
    reading(45, 0); reading(45, 24); look.step(2);
    const yaw = () => lookDirection(new Vector3(0,0,-1), look.x).angleTo(new Vector3(0,0,-1));
    assert.equal(look.gyroState, 'on');assert.ok(yaw() > .649 && yaw() < .651, 'wide manual look preserves the gentle tilt sensitivity');
    assert.equal(look.calibrate(),true);look.step(1);assert.equal(look.x,0);
    reading(45,30);look.step(1);assert.ok(yaw()>.16 && yaw()<.164,'the calibration button makes the current tilt neutral');
    look.centerView();reading(45,30);look.step(1);assert.ok(yaw()>.16 && yaw()<.164,'resetting the view on retry must preserve the chosen calibration');
    device.screen.orientation.angle = 90;
    reading(60, 24); look.step(1);assert.ok(Math.abs(look.x) < .001, 'screen rotation establishes a new neutral hold');
    look.disableGyro();reading(90, 50);look.step(1);assert.equal(look.x,0);
    await look.enableGyro(); await delay(2600);
    assert.equal(look.gyroState,'unavailable','a phone that exposes the API but sends no sensor readings gets a manual fallback');
    let resolve;
    permission = () => new Promise(done => resolve = done);
    const activation = look.enableGyro();look.dispose();
    const count = states.length;
    resolve('granted');await activation;reading(30,0);reading(30,24);
    assert.equal(states.length,count,'no sensor subscription or React update after the game closes');
  } finally {
    look.dispose();
    for (const [key,descriptor] of descriptors) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
    }
  }
});

test("a rhythm bonus requires lateral rolling and freezes during flight", () => {
  const rhythm = new RollRhythm();
  const stroke = (direction, moving=true, near=true) => {
    for (let i=0;i<54;i++) rhythm.step(1/120,direction,moving?direction*2:0,moving?12:0,near);
  };
  stroke(1,false);stroke(-1,false);stroke(1,false);
  assert.equal(rhythm.charge,0,'input without actual rolling earns nothing');
  stroke(-1);stroke(1);stroke(-1);stroke(1);
  assert.ok(rhythm.charge>.4 && rhythm.chain>=2);
  const charge=rhythm.charge, chain=rhythm.chain, cue=rhythm.cue(true);
  for(let i=0;i<360;i++) rhythm.step(1/120,i%2?1:-1,20,20,false);
  assert.equal(rhythm.charge,charge);assert.equal(rhythm.chain,chain);
  assert.deepEqual(rhythm.cue(true),cue,'stroke timing pauses along with charge');
  rhythm.step(1/120,-1,-2,12,true);
  assert.equal(rhythm.chain,chain+1,'the next landed stroke continues the same series');
  for(let i=0;i<60;i++) rhythm.step(1/120,0,0,0,true);
  assert.equal(rhythm.chain,chain+1,'a short pause on the road keeps the series');
  for(let i=0;i<1800;i++) rhythm.step(1/120,0,0,0,true);
  assert.equal(rhythm.chain,0,'a long pause gradually exhausts the series');
  assert.equal(rhythm.charge,0);
});
