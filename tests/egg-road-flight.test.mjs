import assert from 'node:assert/strict';
import test from 'node:test';
import { Sphere, Vector3 } from 'three';
import { initializePhysics, RoadSimulation, PHYSICS_STEP, JUMP_RECHARGE_SECONDS } from '../src/features/EggRoad/simulation.ts';
import { roadCollider, createRoadTrack } from '../src/features/EggRoad/track.ts';
import { predictLanding } from '../src/features/EggRoad/landing.ts';

await initializePhysics();
const advance = (sim, seconds) => { for (let i = 0; i < Math.round(seconds / PHYSICS_STEP); i++) sim.step(0); };
const steerToCentre = sim => sim.step(Math.max(-1, Math.min(1, -sim.position.x * .25 - sim.body.linvel().x * .35)));
function straightRoad() {
  const samples = Array.from({length:301},(_,i)=>({position:new Vector3(0,0,-i),tangent:new Vector3(0,0,-1),right:new Vector3(1,0,0),normal:new Vector3(0,1,0),width:16,distance:i}));
  return {samples,chunks:[roadCollider(samples)],length:300,level:1,seed:0,bounds:new Sphere(new Vector3(0,0,-150),160)};
}

test('one rescue charge refills after six seconds of actual rolling, including small shell hops', () => {
  const sim=new RoadSimulation(straightRoad());
  try {
    sim.start();advance(sim,.5);assert.equal(sim.jump(),true);assert.equal(sim.jump(),false);
    assert.equal(sim.jumpCooldown,JUMP_RECHARGE_SECONDS);
    advance(sim,.25);assert.equal(sim.jumpCooldown,6,'the upward rescue flight cannot charge itself');
    while(sim.phase==='running' && !sim.grounded && sim.seconds<3)sim.step(0);
    assert.ok(sim.grounded);assert.ok(sim.jumpCooldown>5.95,'landing does not grant a new charge');
    const landedAt=sim.seconds;
    for(let i=0;i<708;i++)steerToCentre(sim);assert.equal(sim.jumpAvailable,false,'never ready before six seconds of rolling');
    while(sim.phase==='running' && !sim.jumpAvailable && sim.seconds-landedAt<8)steerToCentre(sim);
    assert.ok(sim.jumpAvailable,'natural shell hops must not make the timer take indefinitely longer');
    assert.ok(sim.seconds-landedAt>=6-PHYSICS_STEP*1.1 && sim.seconds-landedAt<7);
    assert.equal(sim.jumpCooldown,0);assert.equal(sim.jump(),true,'the recovered charge really jumps again');
    assert.equal(sim.jump(),false,'holding or double tapping cannot spend two charges');
    sim.reset();assert.equal(sim.jumpAvailable,true);
  } finally {sim.dispose();}
});

test('air, pause and a stopped egg cannot advance a partially filled jump charge', () => {
  const sim=new RoadSimulation(straightRoad());
  try {
    sim.start();advance(sim,.5);sim.jumpCooldown=1;
    sim.body.setLinvel({x:0,y:0,z:0},true);sim.step(0);
    assert.equal(sim.jumpCooldown,1,'standing on the road is not rolling');
    sim.pause();advance(sim,10);assert.equal(sim.jumpCooldown,1);assert.equal(sim.snapshot().jumpRecharging,false);
    sim.resume();
    sim.body.setTranslation({x:500,y:100,z:0},true);sim.body.setLinvel({x:0,y:-10,z:0},true);
    advance(sim,2);assert.equal(sim.phase,'running');assert.equal(sim.jumpCooldown,1);
    assert.equal(sim.jumpAvailable,false);assert.equal(sim.jump(),false,'air time cannot create another rescue');
  } finally {sim.dispose();}
});

test('the first-contact marker agrees with a real drop without changing the simulation', () => {
  const sim=new RoadSimulation(createRoadTrack());
  try {
    sim.start();advance(sim,.5);
    const target=sim.track.samples[300];
    sim.body.setTranslation(target.position.clone().addScaledVector(target.normal,8),true);
    sim.body.setLinvel(target.tangent.clone().multiplyScalar(7).add(new Vector3(0,-10,0)),true);
    sim.body.setAngvel({x:0,y:0,z:0},true);sim.step(0);
    const before=JSON.stringify({position:sim.body.translation(),velocity:sim.body.linvel(),rotation:sim.body.rotation(),seconds:sim.seconds,score:sim.score});
    const predicted=predictLanding(sim);assert.ok(predicted && predicted.seconds>0 && predicted.seconds<2.4);
    assert.equal(JSON.stringify({position:sim.body.translation(),velocity:sim.body.linvel(),rotation:sim.body.rotation(),seconds:sim.seconds,score:sim.score}),before,'prediction is a read-only query');
    const start=sim.seconds;
    while(sim.phase==='running' && !sim.grounded && sim.seconds-start<2)sim.step(0);
    assert.ok(sim.grounded);
    assert.ok(Math.abs(sim.seconds-start-predicted.seconds)<.15);
    assert.ok(Math.hypot(sim.position.x-predicted.position.x,sim.position.z-predicted.position.z)<1.5);
    assert.ok(Math.abs(predicted.position.clone().sub(predicted.sample.position).dot(predicted.sample.normal))<.08);
  } finally {sim.dispose();}
});

test('no landing promise appears for empty space, road undersides or an exhausted flight window', () => {
  const sim=new RoadSimulation(straightRoad());
  try {
    sim.start();sim.step(0);
    sim.body.setTranslation({x:500,y:20,z:-40},true);sim.body.setLinvel({x:0,y:-10,z:0},true);sim.step(0);
    assert.equal(predictLanding(sim),null);
    sim.body.setTranslation({x:0,y:-5,z:-40},true);sim.body.setLinvel({x:0,y:20,z:0},true);sim.step(0);
    assert.equal(predictLanding(sim),null,'hitting an underside does not suggest a safe landing');
    sim.flightTime=4.2;assert.equal(predictLanding(sim),null);
  } finally {sim.dispose();}
});
