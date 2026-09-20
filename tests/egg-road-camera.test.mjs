import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { CameraLook, ChaseHeading, ChaseRig, CHASE_TURN_SPEED, MapOrbit, lookDirection, orientationLook, overviewPose } from "../src/features/EggRoad/camera.ts";
import { createRoadTrack } from "../src/features/EggRoad/track.ts";
import { RollRhythm } from "../src/features/EggRoad/rhythm.ts";

test('a sustained travel reversal puts the camera behind the moving egg without waiting for a landing', () => {
  const road = new Vector3(0, 0, -1), results = [];
  for (const fps of [30, 60, 120]) {
    const heading = new ChaseHeading(), rig = new ChaseRig(), egg = new Vector3();
    heading.reset(road); heading.landed(); rig.reset(egg, road);
    let travelled = 0;
    for (let i = 0; i < fps * 5; i++) {
      const before = heading.direction.clone();
      heading.step(1/fps, { x: i%2 ? .01 : -.01, z: 12 }, true);
      rig.step(1/fps, egg, heading.direction, 0, true);
      if (i >= fps) assert.ok(rig.position.z < 0, 'after one second the camera is behind backward motion, even while airborne');
      const turn = before.angleTo(heading.direction); travelled += turn;
      assert.ok(Number.isFinite(turn) && turn <= CHASE_TURN_SPEED/fps + 1e-6);
      assert.ok(Math.abs(heading.direction.length() - 1) < 1e-10, 'no zero vector at the halfway point');
    }
    assert.ok(heading.direction.z > .999, 'a sustained reversal is eventually followed');
    assert.ok(travelled > 3.1 && travelled < 3.3, 'noise must not make the camera oscillate or take extra turns');
    results.push(heading.direction.clone());
  }
  assert.ok(results[0].angleTo(results[2]) < .01);
});

test('short impact reversals and almost stationary noise do not turn the camera; chained drops follow sustained motion', () => {
  const forward = new Vector3(0, 0, -1), velocity = new Vector3(12, 0, 0), heading = new ChaseHeading();
  heading.reset(forward);
  for (let bounce = 0; bounce < 5; bounce++) {
    for (let i = 0; i < 6; i++) heading.step(1/60, { x: 0, z: 12 }, true);
    heading.landed();
    for (let i = 0; i < 20; i++) heading.step(1/60, { x: 0, z: -12 }, false);
    assert.ok(heading.direction.angleTo(forward) < 1e-9, 'a tenth-second reversed impact cannot commit to a U-turn');
    assert.equal(heading.inFlight, true);
  }
  for (let i = 0; i < 120; i++) heading.step(1/60, { x: Math.sin(i) * 2, z: Math.cos(i) * 2 }, Boolean(i%2));
  assert.ok(heading.direction.angleTo(forward) < 1e-9, 'vertical bounce and low horizontal speed keep the last useful direction');
  for (let i = 0; i < 120; i++) {
    if (i%20===0) heading.landed();
    heading.step(1/60, velocity, i%20<10);
  }
  assert.ok(heading.direction.angleTo(velocity) < .01, 'successive impacts cannot freeze a real change of travel direction');
  for (let i = 0; i < 40; i++) heading.step(1/60, velocity, false);
  assert.equal(heading.inFlight, false);
  assert.ok(heading.direction.angleTo(velocity) < .01, 'contact does not switch the camera back to a road tangent');
});

test('the camera orbits outside the egg through reversals, hard bounces and origin rebasing', () => {
  const rig = new ChaseRig(), egg = new Vector3(), forward = new Vector3(0, 0, -1);
  rig.reset(egg, forward);
  const backward = forward.clone().negate();
  let previous = rig.position.clone();
  for (let i = 0; i < 180; i++) {
    rig.step(1/60, egg, backward, 0);
    assert.ok(Math.hypot(rig.position.x, rig.position.z) > 11.99, 'an orbit must not cut through the egg');
    assert.ok(previous.clone().setY(0).angleTo(rig.position.clone().setY(0)) <= CHASE_TURN_SPEED/60 + 1e-6);
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

test('direct look gestures stop at the chosen view and explicit recentering stays smooth', () => {
  const look = new CameraLook(() => {});
  look.drag(80, 20); look.step(1/60);
  assert.ok(look.x > 0 && look.x < .02 && look.y > 0, 'a drag starts smoothly');
  for (let i = 0; i < 180; i++) look.step(1/60);
  const held = { x: look.x, y: look.y };
  for (let i = 0; i < 180; i++) look.step(1/60);
  assert.ok(Math.abs(look.x-held.x) < 1e-6 && Math.abs(look.y-held.y) < 1e-6, 'release keeps the angle instead of continuing to turn');
  assert.ok(held.x > .2 && held.x < .35);
  look.drag(NaN, Infinity); look.step(1/60); assert.ok(Number.isFinite(look.x));
  for (let i = 0; i < 20; i++) look.drag(60, 0);
  for (let i = 0; i < 240; i++) look.step(1/60);
  assert.ok(lookDirection(new Vector3(0,0,-1),look.x).z > .9, 'the full 200-degree range is still available');
  look.resetView(); const before = look.x; look.step(1/60);
  assert.ok(before - look.x <= .65/60 + 1e-9 && look.x > .9, 'recenter never snaps');
  for (let i = 0; i < 300; i++) look.step(1/60);
  assert.ok(Math.abs(look.x) < 1e-5 && Math.abs(look.y) < 1e-5);
  for (let i = 0; i < 240; i++) look.step(1/60, -1);
  assert.ok(look.x < -.99, 'keyboard retains the full range');
  look.recenter(); assert.equal(look.x, 0);
});

test('keyboard turns slow near the rear and keep consistent speed limits at different frame rates', () => {
  const profiles=[];
  for (const fps of [30,60,120]) {
    const look=new CameraLook(()=>{}),profile=[];
    for(let i=0;i<fps*3;i++) {const before=look.x;look.step(1/fps,1);assert.ok(look.x-before<=.65/fps+1e-9);profile.push(look.x);}
    assert.ok(profile[2.5*fps]-profile[2*fps] < (profile[fps]-profile[fps/2])*.7);
    profiles.push(profile[fps-1]);
  }
  assert.ok(Math.max(...profiles)-Math.min(...profiles)<.01);
});

test('flight framing smoothly widens and looks down without orbiting through the egg', () => {
  const rig=new ChaseRig(),egg=new Vector3(),forward=new Vector3(0,0,-1);
  rig.reset(egg,forward); const initial=rig.position.clone();
  rig.step(1/60,egg,forward,0,true);assert.ok(rig.position.distanceTo(initial)<.5);
  for(let i=0;i<180;i++) rig.step(1/60,egg,forward,0,true);
  assert.ok(rig.position.z>17.9 && rig.position.y>11.3 && rig.target.y< -5.7);
  for(let i=0;i<360;i++) rig.step(1/60,egg,forward,0,false);
  assert.ok(rig.position.distanceTo(initial)<.001);
});

test('flight framing keeps the egg and contact clear of the top and bottom HUD without changing yaw', () => {
  for (const [aspect,fov] of [[844/390,79],[320/568,81]]) for (const depth of [8,24,40]) {
    const rig=new ChaseRig(),egg=new Vector3(),forward=new Vector3(0,0,-1),landing=new Vector3(4,-depth,2);
    rig.reset(egg,forward);
    for(let i=0;i<120;i++)rig.step(1/60,egg,forward,0,true,landing);
    const camera=new PerspectiveCamera(fov,aspect,.1,310);
    camera.position.copy(rig.position);camera.lookAt(rig.target);camera.updateMatrixWorld();
    for(const point of [egg,landing]) {
      const projected=point.clone().project(camera);
      assert.ok(Math.abs(projected.x)<.85 && Math.abs(projected.y)<.57, 'both reference points stay in the open part of the screen');
    }
    assert.equal(rig.position.x,0,'vertical framing cannot introduce an automatic sideways turn');
  }
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
