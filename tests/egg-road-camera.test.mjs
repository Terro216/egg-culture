import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Vector3 } from "three";
import { CameraLook, lookDirection, orientationLook } from "../src/features/EggRoad/camera.ts";
import { RollRhythm } from "../src/features/EggRoad/rhythm.ts";

test("look controls are bounded, smooth, and return to the forward view", () => {
  const look = new CameraLook(() => {});
  look.setManual(10, -10); look.step(.1);
  assert.ok(look.x > 0 && look.x < 1 && look.y < 0 && look.y > -1);
  for (let i = 0; i < 60; i++) look.step(1/60);
  const facing = lookDirection(new Vector3(0, 0, -1), look.x);
  assert.ok(facing.z > .9 && facing.x < -.3, "manual look reaches past the rear view to 200 degrees");
  const left = lookDirection(new Vector3(0, 0, -1), -1);
  assert.ok(left.z > .9 && left.x > .3, "the same range is available to the left");
  for (const side of [-1, 1]) {
    const rear = lookDirection(new Vector3(0, 0, -1), side * .9);
    assert.ok(rear.z > .999 && Math.abs(rear.x) < 1e-9, "180 degrees looks straight behind the egg");
  }
  look.setManual(0, 0);
  for (let i = 0; i < 120; i++) look.step(1/60);
  assert.ok(Math.abs(look.x) < 1e-5 && Math.abs(look.y) < 1e-5);
  look.step(.5, -1); assert.ok(look.x < -.9);
  look.recenter(); assert.equal(look.x, 0);
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
    reading(45, 0); reading(45, 24); look.step(1);
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
    for (let i=0;i<54;i++) rhythm.step(1/120,direction,moving?direction*2:0,moving?2:0,near);
  };
  stroke(1,false);stroke(-1,false);stroke(1,false);
  assert.equal(rhythm.charge,0,'input without actual rolling earns nothing');
  stroke(-1);stroke(1);stroke(-1);stroke(1);
  assert.ok(rhythm.charge>.4 && rhythm.chain>=2);
  const charge=rhythm.charge, chain=rhythm.chain, cue=rhythm.cue(true);
  for(let i=0;i<360;i++) rhythm.step(1/120,i%2?1:-1,20,20,false);
  assert.equal(rhythm.charge,charge);assert.equal(rhythm.chain,chain);
  assert.deepEqual(rhythm.cue(true),cue,'stroke timing pauses along with charge');
  rhythm.step(1/120,-1,-2,2,true);
  assert.equal(rhythm.chain,chain+1,'the next landed stroke continues the same series');
  for(let i=0;i<60;i++) rhythm.step(1/120,0,0,0,true);
  assert.equal(rhythm.chain,0,'being idle on the road still breaks the rhythm');
});
