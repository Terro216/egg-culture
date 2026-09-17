import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Quaternion, Vector3 } from 'three';
import { roadCode, parseRoadCode } from '../src/features/EggRoad/seed.ts';
import { createRoadTrack } from '../src/features/EggRoad/track.ts';
import { createEndlessTrack, streamEndless } from '../src/features/EggRoad/endless.ts';
import { RoadJourney } from '../src/features/EggRoad/journey.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { RoadScoring } from '../src/features/EggRoad/scoring.ts';
import { RollRhythm } from '../src/features/EggRoad/rhythm.ts';
import { readPointsBest, saveRoadScore, readSavedRoads, saveRoad, forgetRoad } from '../src/features/EggRoad/storage.ts';
await initializePhysics();

test('map codes round-trip their geometry and reject typos, versions and invalid ranges', () => {
  for (const seed of [0, 1, 123456, 0xffffffff]) for (const mode of ['seed','endless']) {
    const spec={mode,level:2,seed}, code=roadCode(spec);
    assert.deepEqual(parseRoadCode(code.toLowerCase()),spec);
    assert.deepEqual(parseRoadCode(`https://egg.ilyamedve.dev/en/dark-side/games/?road=${code}`),spec);
    const parsed=parseRoadCode(code);
    assert.deepEqual(createRoadTrack(parsed.level,parsed.seed).chunks[0].vertices,createRoadTrack(spec.level,spec.seed).chunks[0].vertices);
  }
  for(const bad of ['','EGG2-R-2-ABC','EGG1-E-1-ABC','EGG1-R-0-ABC','EGG1-R-1001-1','EGG1-R-2-ZZZZZZZ','EGG1-R-2-ABC extra','https://example.org/?other=ABC']) assert.equal(parseRoadCode(bad),null);
});

test('endless roads join exactly and stream indefinitely with bounded geometry', () => {
  const a=createEndlessTrack(739), b=createEndlessTrack(739);
  for(let step=0;step<25;step++) {
    const progress=a.samples[a.chunks[1].last].distance+3;
    streamEndless(a,progress);streamEndless(b,progress);
    assert.ok(a.chunks.length<=4 && a.samples.length<10000);
    assert.deepEqual(a.chunks.at(-1).vertices,b.chunks.at(-1).vertices);
    for(let i=1;i<a.chunks.length;i++) {
      const left=a.chunks[i-1],right=a.chunks[i];
      assert.equal(left.last,right.first);
      assert.deepEqual(left.vertices.slice(-12),right.vertices.slice(0,12),'identical seam vertices prevent a physical gap');
      const seam=a.samples[right.first];
      assert.ok(seam.tangent.dot(a.samples[right.first+1].tangent)>.999);
    }
  }
  assert.ok(a.samples[0].distance>10000,'the retained window has advanced far beyond the first course');
});

test('endless physics continues over seams, retires colliders, and rebases long runs', () => {
  const track=createEndlessTrack(273),sim=new RoadSimulation(track,'endless');
  try {
    sim.start();let rebases=0;
    for(let part=0;part<12;part++) {
      const current=track.chunks.find(chunk=>track.samples[chunk.last].distance>sim.progress+1);
      const seam=current.last;
      sim.sampleIndex=Math.max(10,seam-5);
      const s=track.samples[sim.sampleIndex];
      sim.body.setRotation(new Quaternion().setFromEuler(new Euler(0,Math.atan2(-s.tangent.x,-s.tangent.z)+.24,Math.PI/2-.16)),true);
      sim.body.setTranslation(s.position.clone().addScaledVector(s.normal,1.2),true);
      sim.position.copy(sim.body.translation());
      sim.body.setLinvel(s.tangent.clone().multiplyScalar(18),true);
      sim.body.setAngvel(s.right.clone().multiplyScalar(-18/.74),true);
      sim.airTime=sim.flightTime=0;
      let landedBeyond=false;
      for(let i=0;i<220;i++){sim.step(0);if(sim.grounded && sim.progress>s.distance+6)landedBeyond=true;}
      assert.equal(sim.phase,'running');
      assert.ok(landedBeyond,'the egg makes physical contact beyond the seam');
      assert.ok(sim.progress>s.distance+5);
      assert.ok(sim.roadColliders.size<=4);
      assert.ok(sim.position.length()<1500);
      if(sim.originShift.lengthSq()){rebases++;sim.originShift.set(0,0,0);}
    }
    assert.ok(rebases>0,'a long run actually exercises the floating origin');
  } finally {sim.dispose();}
});

test('endless retry restores its seed and imported maps never unlock campaign levels', () => {
  const journey=new RoadJourney({level:4,seed:7});
  try {
    journey.select({mode:'endless',level:2,seed:88});
    const first=journey.simulation.track.chunks[0].vertices.slice();
    journey.simulation.start();assert.equal(journey.simulation.jump(),true);
    streamEndless(journey.simulation.track,2000);
    assert.equal(journey.simulation.snapshot().jumpAvailable,false,'new endless sections do not give another jump');
    journey.retry();assert.equal(journey.simulation.snapshot().jumpAvailable,true,'a new attempt recharges the jump');
    assert.deepEqual(journey.simulation.track.chunks[0].vertices,first);
    journey.select({mode:'seed',level:5,seed:123});
    journey.simulation.phase='finished';
    assert.equal(journey.checkpoint(),null);assert.equal(journey.advance(),false);
    journey.practice();assert.equal(journey.simulation.mode,'practice');
  } finally {journey.dispose();}
});

test('bonus points reward new edge, speed, rhythm and landing progress, never repeated ground', () => {
  const score=new RoadScoring();
  const contact={distance:18,gates:1,speed:26,edgeGap:.2,chain:3,drop:30,skipped:2,seconds:1};
  score.contact(contact);
  assert.equal(score.totals.gates,100);assert.equal(score.totals.edge,14);
  assert.equal(score.totals.rhythm,6);assert.equal(score.totals.drop,90);assert.equal(score.totals.shortcut,70);
  assert.ok(score.totals.speed>0);
  const earned=score.total;
  for(let i=0;i<200;i++) score.contact({...contact,seconds:2+i/120,distance:i%2?10:18});
  assert.equal(score.total,earned);
  score.contact({...contact,distance:19,drop:0,skipped:0,edgeGap:3,speed:10,chain:0});
  assert.equal(score.total,earned);
  assert.equal(Object.values(score.breakdown()).reduce((a,b)=>a+b,0),score.total);
  score.reset();assert.equal(score.total,0);assert.equal(score.notice,null);
});

test('high-drop bonuses are banked on a real landing, while an unsuccessful fall earns none', () => {
  const sim=new RoadSimulation(createRoadTrack());
  try {
    sim.start();for(let i=0;i<60;i++)sim.step(0);
    const landing=sim.track.samples[300];
    sim.body.setTranslation(landing.position.clone().addScaledVector(landing.normal,25),true);
    sim.body.setLinvel({x:0,y:-5,z:0},true);sim.body.setAngvel({x:0,y:0,z:0},true);
    for(let i=0;i<200;i++)sim.step(0);
    assert.ok(sim.scoring.totals.drop>=36);
    assert.ok(sim.scoring.totals.shortcut>0);
    const points=sim.score;
    sim.body.setTranslation({x:500,y:100,z:500},true);sim.body.setLinvel({x:0,y:0,z:0},true);
    for(let i=0;i<520;i++)sim.step(0);
    assert.equal(sim.phase,'over');assert.equal(sim.score,points);
  } finally {sim.dispose();}
});

test('natural corrections with pauses and uneven timing earn rhythm without watching a cue', () => {
  const r=new RollRhythm();assert.equal(r.cue(true).state,'start');
  let direction=1;
  for(const duration of [.2,.37,.68,1.4,.25]) {
    for(let i=0;i<Math.ceil(duration*120);i++)r.step(1/120,direction,.8,12,true);
    for(let i=0;i<54;i++)r.step(1/120,0,.5,12,true);
    direction*=-1;
    assert.equal(r.step(1/120,direction,.8,12,true),true,'braking a drift counts too');
  }
  assert.equal(r.chain,5);assert.ok(r.charge>.9);
  assert.equal(r.cue(true).state,'flow');
  assert.equal(r.cue(false).state,'air');
});

test('saved map codes and mode records survive reload without converting old gate records', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  try {
    values.set('egg_road_v1','{"best":47}');assert.equal(readPointsBest(),0);
    saveRoadScore('practice',200);saveRoadScore('endless',500);saveRoadScore('practice',100);
    assert.equal(readPointsBest('practice'),200);assert.equal(readPointsBest('endless'),500);assert.equal(readPointsBest(),500);
    for(let i=0;i<14;i++)saveRoad(roadCode({mode:'seed',level:2,seed:i}));
    assert.equal(readSavedRoads().length,14);
    const first=readSavedRoads()[0];saveRoad(first);assert.equal(readSavedRoads().length,14);
    forgetRoad(first);assert.equal(readSavedRoads().length,13);
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});

test('real shell clearance earns edge points on either side of the road', () => {
  for (const side of [-1, 1]) {
    const sim = new RoadSimulation(createRoadTrack());
    try {
      const surface = sim.track.samples[10];
      sim.body.setTranslation(sim.position.clone().addScaledVector(surface.right, side * 4), true);
      sim.start();for(let i=0;i<100;i++)sim.step(0);
      assert.ok(sim.scoring.totals.edge>10);
    } finally {sim.dispose();}
  }
});
