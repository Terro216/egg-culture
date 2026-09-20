import assert from 'node:assert/strict';
import test from 'node:test';
import { roadViewport, roadViewDelta } from '../src/features/EggRoad/viewport.ts';
import { CameraLook } from '../src/features/EggRoad/camera.ts';

test('landscape and portrait fill the viewport whether native orientation lock is supported or not', () => {
  assert.deepEqual(roadViewport(390,844,'landscape'), {width:844,height:390,rotation:90});
  assert.deepEqual(roadViewport(844,390,'landscape'), {width:844,height:390,rotation:0});
  assert.deepEqual(roadViewport(844,390,'portrait'), {width:390,height:844,rotation:-90});
  assert.deepEqual(roadViewport(390,844,'portrait'), {width:390,height:844,rotation:0});
  assert.deepEqual(roadViewport(1280,720,null), {width:1280,height:720,rotation:0});
  assert.deepEqual(roadViewport(320,260,'portrait',0), {width:320,height:260,rotation:0}, 'a software keyboard must not rotate the game');
});

test('touch halves, camera and overview drags follow the displayed axes in all orientations', () => {
  for (const rotation of [-90,0,90]) {
    const angle = rotation * Math.PI / 180;
    for (const [x,y] of [[-100,0],[100,0],[0,-60],[0,60],[-80,40]]) {
      const physicalX = x * Math.cos(angle) - y * Math.sin(angle);
      const physicalY = x * Math.sin(angle) + y * Math.cos(angle);
      const local = roadViewDelta(physicalX,physicalY,rotation);
      assert.ok(Math.abs(local.x-x)<1e-9 && Math.abs(local.y-y)<1e-9);
    }
  }
});

test('software rotation recalibrates gyro look and rotates only the camera sensor axes', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'window');
  const sensorType = Object.getOwnPropertyDescriptor(globalThis,'DeviceOrientationEvent');
  const device = Object.assign(new EventTarget(), {isSecureContext:true,screen:{orientation:{angle:0}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:device});
  Object.defineProperty(globalThis,'DeviceOrientationEvent',{configurable:true,value:class {}});
  const look = new CameraLook(() => {});
  const send = (beta,gamma) => {const event = new Event('deviceorientation');Object.assign(event,{beta,gamma});device.dispatchEvent(event);};
  try {
    await look.enableGyro(); send(45,0); send(45,24);
    for(let i=0;i<60;i++) look.step(1/60);
    assert.ok(look.x>0.1);
    look.setViewRotation(90); send(45,24);
    for(let i=0;i<120;i++) look.step(1/60);
    assert.ok(Math.abs(look.x)<0.001,'rotating must first establish a new neutral tilt');
    send(69,24);
    for(let i=0;i<60;i++) look.step(1/60);
    assert.ok(look.x>0.1 && Math.abs(look.y)<0.001,'the physical vertical axis becomes displayed horizontal look');
  } finally {
    look.dispose();
    for(const [key,descriptor] of [['window',previous],['DeviceOrientationEvent',sensorType]]) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
    }
  }
});
