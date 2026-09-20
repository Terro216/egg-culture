import assert from 'node:assert/strict';
import test from 'node:test';
import { Sphere, Vector3 } from 'three';
import { RoadSteering, SteeringRamp } from '../src/features/EggRoad/controls.ts';
import { createRoadTrack, roadCollider } from '../src/features/EggRoad/track.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { RollRhythm } from '../src/features/EggRoad/rhythm.ts';

test('holding either screen half reaches full input without dragging; crossing the centre reverses it', () => {
  const input = new RoadSteering();
  input.begin(1, 1); assert.equal(input.value, 1);
  input.move(1, 1); assert.equal(input.value, 1, 'movement inside the same half does not weaken steering');
  input.move(1, -1); assert.equal(input.value, -1);
  input.move(1, 1); assert.equal(input.value, 1);
  input.end(1); assert.equal(input.value, 0);
  assert.equal(input.move(1, -1), false, 'a cancelled or released pointer cannot resume steering');
  assert.equal(input.value, 0);
});

test('multiple fingers, cancellation and pause clear independently without latching a turn', () => {
  const input = new RoadSteering();
  input.begin(1, -1); input.begin(2, 1); assert.equal(input.value, 0);
  input.end(2); assert.equal(input.value, -1);
  input.begin(3, -1); assert.equal(input.value, -1, 'two fingers do not double the force');
  input.end(1); assert.equal(input.value, -1, 'releasing one finger leaves the other in control');
  input.clear(); assert.equal(input.value, 0);
  assert.equal(input.move(3, 1), false);
});

test('touch and keyboard taps are gentle, holding reaches full force and release immediately stops applying it', () => {
  const input = new SteeringRamp();
  for (let i = 0; i < 6; i++) input.step(1/120, 1);
  assert.ok(input.step(0, 1) > .2 && input.step(0, 1) < .4);
  for (let i = 0; i < 16; i++) input.step(1/120, 1);
  assert.equal(input.step(0, 1), 1);
  assert.equal(input.step(1/120, 0), 0);
  assert.ok(input.step(1/120, -1) < 0 && input.step(0, -1) > -.1);
  input.reset(); assert.equal(input.step(0, 1), 0);
});

test('gentle steering produces a smaller real correction and still allows rhythm', async () => {
  await initializePhysics();
  const track = createRoadTrack();
  const run = force => {
    const sim = new RoadSimulation(track);
    try { sim.start(); for (let i = 0; i < 42; i++) sim.step(force); return sim.position.x; }
    finally { sim.dispose(); }
  };
  const soft = run(.25), full = run(1);
  assert.ok(soft > 0 && full > soft * 2, 'force changes the physical path, not just the indicator');
  const rhythm = new RollRhythm();
  for (const direction of [1,-1,1,-1]) for (let i = 0; i < 48; i++) rhythm.step(1/120, direction * .25, direction, 15, true);
  assert.ok(rhythm.chain >= 3 && rhythm.charge > .6, 'normal light corrections remain eligible for rhythm');
});

test('a stationary touch ramps to the same physical turn as a held key while taps stay smaller', async () => {
  await initializePhysics();
  const track = createRoadTrack();
  const run = frames => {
    const sim = new RoadSimulation(track), touch = new RoadSteering(), ramp = new SteeringRamp();
    try {
      sim.start(); touch.begin(1, 1);
      for (let i=0; i<36; i++) {
        if (i === frames) touch.end(1);
        sim.step(ramp.step(1/120, touch.value));
      }
      return sim.position.x;
    } finally { sim.dispose(); }
  };
  const tap = run(6), hold = run(36);
  assert.ok(tap > 0 && hold > tap * 3, 'holding without any pointer move supplies a strong turn');
});

function straightRoad() {
  const samples = Array.from({length:201}, (_,i) => ({position:new Vector3(0,0,-i),tangent:new Vector3(0,0,-1),right:new Vector3(1,0,0),normal:new Vector3(0,1,0),width:8.1,distance:i}));
  return {samples,chunks:[roadCollider(samples)],length:200,level:1,seed:0,bounds:new Sphere(new Vector3(0,0,-100),110)};
}

test('countersteering catches an ordinary shell hop before the visible rim leaves the lane', async () => {
  await initializePhysics();
  for (const side of [-1,1]) {
    const sim = new RoadSimulation(straightRoad());
    try {
      sim.start();sim.body.setTranslation({x:side*2.15,y:2.6,z:-30},true);
      sim.body.setLinvel({x:side*5.5,y:0,z:-18},true);sim.step(0);
      assert.equal(sim.nearRoad,false,'the egg has left close-contact steering range');
      assert.equal(sim.rollingOnRoad,true,'this remains a small hop above the lane');
      let rim = -Infinity;
      for (let i=0;i<36;i++) {
        sim.step(-side);
        assert.equal(sim.grounded,false,'the correction works before landing');
        for (let j=0;j<sim.hull.length;j+=3) {
          const vertex = new Vector3().fromArray(sim.hull,j).applyQuaternion(sim.rotation).add(sim.position);
          rim = Math.max(rim,side*vertex.x);
        }
      }
      assert.ok(sim.body.linvel().x*side<0,'the held correction reverses the outward drift within 0.3 seconds');
      assert.ok(rim<4.05,'the actual shell, not just its centre, stays above the lane');
    } finally {sim.dispose();}
  }
});

test('a real drop and a rescue jump keep their weaker air control; releasing input never catches the egg automatically', async () => {
  await initializePhysics();
  for (const kind of ['drop','jump','release']) {
    const sim = new RoadSimulation(straightRoad());
    try {
      sim.start();sim.body.setTranslation({x:0,y:kind==='drop'?30:2.6,z:-30},true);
      sim.body.setLinvel({x:5.5,y:0,z:-18},true);sim.step(0);
      if (kind==='jump') assert.equal(sim.jump(),true);
      if (kind!=='release') assert.equal(sim.rollingOnRoad,false);
      for (let i=0;i<36;i++) sim.step(kind==='release'?0:-1);
      assert.ok(sim.body.linvel().x>.5,'only ordinary hops with player input get the stronger correction');
      if (kind==='release') assert.ok(sim.body.linvel().x>5,'there is no automatic sideways braking');
    } finally {sim.dispose();}
  }
});
