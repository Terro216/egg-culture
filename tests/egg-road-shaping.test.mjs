import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {createRoadTrack,hasRoadClearance,nearestRoadSample} from '../src/features/EggRoad/track.ts';
import {createEndlessTrack,streamEndless,shiftEndless,partLevel,partSeed,joinRoadPart} from '../src/features/EggRoad/endless.ts';
import {packTrack,unpackTrack} from '../src/features/EggRoad/trackTransfer.ts';
import {dailyRoad,parseRoadCode,roadCode} from '../src/features/EggRoad/seed.ts';
import {roadFinish} from '../src/features/EggRoad/finish.ts';
import {initializePhysics,RoadSimulation} from '../src/features/EggRoad/simulation.ts';
import {SteeringRamp} from '../src/features/EggRoad/controls.ts';
import {roadVariationChance} from '../src/features/EggRoad/variations.ts';
await initializePhysics();
const hash=t=>createHash('sha256').update(t.chunks[0].vertices).update(t.chunks[0].indices).digest('hex');

test('new road codes preserve the exact original EGG1 and EGG2 geometry',()=>{
 for(const fixture of JSON.parse(readFileSync(new URL('./fixtures/egg-road-legacy-geometry.json',import.meta.url)))){
  assert.equal(hash(createRoadTrack(fixture.level,fixture.seed,fixture.version)),fixture.hash);
 }
 for(const mode of ['seed','endless']){
  const spec={mode,level:mode==='seed'?5:2,seed:123,version:3};assert.deepEqual(parseRoadCode(roadCode(spec)),spec);
 }
 assert.equal(dailyRoad(new Date('2026-09-23')).version,3);
 assert.deepEqual(dailyRoad(new Date('2026-09-23T00:00:00Z')),dailyRoad(new Date('2026-09-23T23:59:59Z')));
 assert.equal(createRoadTrack(1,0,3).variations,undefined);
});

test('bridges and bends stay short, continuous, separated from turns and reproducible',()=>{
 const kinds=new Set();let early=0,late=0;
 for(const level of [2,5,20,1000])for(let seed=0;seed<8;seed++){
  const track=createRoadTrack(level,seed,3),after=createRoadTrack(level,seed,3,6000);
  assert.ok(hasRoadClearance(track.samples));assert.ok(hasRoadClearance(after.samples));
  assert.equal(hash(track),hash(createRoadTrack(level,seed,3)));
  early+=track.variations.length;late+=after.variations.length;
  for(let i=1;i<track.samples.length;i++){
   const a=track.samples[i-1],b=track.samples[i];assert.ok(b.position.y<a.position.y);
   assert.ok(b.distance>a.distance);assert.ok(b.width>=5.2);
   assert.ok(Math.abs(b.width-a.width)<.6);assert.ok(a.tangent.dot(b.tangent)>.995);
   assert.ok(Math.abs(b.normal.dot(b.tangent))<1e-10);
  }
  for(const v of track.variations){
   kinds.add(v.kind);const samples=track.samples.slice(v.first,v.last+1);
   assert.ok(samples[0].distance>120);assert.ok(samples.at(-1).distance<track.length-48);
   assert.ok(samples.at(-1).distance-samples[0].distance<41);
   if(v.kind==='bridge')assert.ok(Math.min(...samples.map(s=>s.width))<6.1);
  }
 }
 assert.deepEqual([...kinds].sort(),['bend','bridge']);assert.ok(late>early*1.2,JSON.stringify({early,late}));
 assert.ok(roadVariationChance(6000)>roadVariationChance(1000));assert.ok(roadVariationChance(1e9)<.73);
});

test('endless preparation uses total distance, survives worker transfer and keeps bounded features',()=>{
 const track=createEndlessTrack(739,3);
 for(let i=0;i<6;i++){
  const part=track.endless.nextPart,tail=track.samples.at(-1);
  const prepared=joinRoadPart(unpackTrack(packTrack(createRoadTrack(partLevel(part),partSeed(track.seed,part),3,tail.distance))),tail);
  const expected=prepared.samples[10].position.clone();
  track.endless.prepared={part,track:prepared,fitted:true};
  const shift=new Vector3(100,0,-100);shiftEndless(track,shift);
  const progress=track.samples[track.chunks[1].last].distance+1;
  streamEndless(track,progress);
  const chunk=track.chunks.find(c=>Math.abs(track.samples[c.first].distance-prepared.samples[0].distance)<1e-8);
  assert.ok(chunk);
  assert.ok(track.samples[chunk.first+10].position.distanceTo(expected.sub(shift))<1e-8);
  assert.ok(track.chunks.length<=4);
  for(const v of track.variations)assert.ok(v.first>=0&&v.last<track.samples.length);
 }
});

test('real physics can roll through both small features with ordinary steering',()=>{
 const seen=new Set();
 for(const seed of [0,1,4,6]){
  const track=createRoadTrack(5,seed,3);
  for(const v of track.variations){
   const sim=new RoadSimulation(track),ramp=new SteeringRamp();seen.add(v.kind);
   try{
    sim.start();const first=v.first-15,s=track.samples[first];sim.sampleIndex=first;
    sim.body.setTranslation(s.position.clone().addScaledVector(s.normal,1.1),true);
    sim.body.setLinvel(s.tangent.clone().multiplyScalar(18),true);
    sim.body.setAngvel(s.right.clone().multiplyScalar(-18/.74),true);
    sim.position.copy(sim.body.translation());sim.steeringRight.copy(s.right);
    const target=track.samples[v.last+10].distance;
    for(let i=0;i<120*8&&sim.phase==='running'&&sim.progress<target;i++){
     const index=nearestRoadSample(track,sim.position,Math.max(0,sim.sampleIndex-10),Math.min(track.samples.length-1,sim.sampleIndex+40));
     const sample=track.samples[index],velocity=new Vector3().copy(sim.body.linvel());
     const offset=sim.position.clone().sub(sample.position).dot(sample.right);
     const correction=-offset-velocity.dot(sample.right)*.25;
     sim.step(ramp.step(1/120,Math.max(-1,Math.min(1,correction*1.5))));
    }
    assert.ok(sim.progress>=target,JSON.stringify({seed,kind:v.kind,phase:sim.phase,distance:sim.progress,target}));
   }finally{sim.dispose()}
  }
 }
 assert.equal(seen.size,2);
});

test('the smaller saucer misses wide drops that the oversized finish used to catch',()=>{
 for(const [x,z] of [[14,0],[-14,0],[0,24]]){
  const sim=new RoadSimulation(createRoadTrack(2,739,3)),f=roadFinish(sim.track);
  try{
   sim.start();sim.step(0);sim.sampleIndex=sim.track.samples.length-4;sim.nearRoad=sim.grounded=false;
   sim.body.setTranslation(f.center.clone().addScaledVector(f.right,x).addScaledVector(f.tangent,z).addScaledVector(f.normal,5),true);
   sim.body.setLinvel(f.normal.clone().multiplyScalar(-9),true);sim.body.setAngvel({x:0,y:0,z:0},true);
   for(let i=0;i<120&&sim.phase==='running';i++)sim.step(0);
   assert.notEqual(sim.phase,'finished');
  }finally{sim.dispose()}
 }
 const spec=dailyRoad(new Date('2026-09-23'));
 for(const version of [2,3]){
  const track=createRoadTrack(spec.level,spec.seed,version),f=roadFinish(track);
  for(const s of track.samples.filter(s=>s.distance<120)){
   const projected=s.position.clone();projected.y-=projected.clone().sub(f.center).dot(f.normal)/f.normal.y;
   const delta=projected.sub(f.center);
   assert.ok((delta.dot(f.right)/7)**2+(delta.dot(f.tangent)/10)**2>1,'Daily finish is directly below the opening');
  }
 }
});

test('EGG3 records stay separate from older maps and still appear in the profile',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {createRoadRecordStore}=await import('../src/server/roadRecords.ts');
 const {readRoadProgress,saveRoadProgress}=await import('../src/features/EggRoad/storage.ts');
 const directory=await mkdtemp(join(tmpdir(),'egg-road-v3-'));const store=createRoadRecordStore(directory);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
 try{
  store.register('guest','Shaping Test','test-hash','test-recovery','test-session');const player=store.credentials('Shaping Test').player;
  for(const [version,score] of [[1,100],[2,200],[3,300]]){
   store.submit(player,{code:`EGG${version}-E-2-ABC`,name:'Shaping Test',score,gates:score/100,distance:score/100*18+1,seconds:10,finished:false});
  }
  for(const version of [1,2,3]){const board=store.read(`EGG${version}-E-2-ABC`,player);assert.equal(board.personal.score,version*100);assert.equal(board.endlessBest,version*100);}
  const profile=store.ownProfile(player);assert.equal(profile.stats.find(s=>s.game==='road').best,'300');
  assert.equal(profile.stats.find(s=>s.game==='road').roadRules,2);
  saveRoadProgress({level:7,seed:42,version:3},'shaping');assert.deepEqual(readRoadProgress('shaping'),{level:7,seed:42,version:3});
 }finally{store.close();await rm(directory,{recursive:true,force:true});if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
