import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Ball } from '@dimforge/rapier3d-compat';
import { createRoadTrack } from '../src/features/EggRoad/track.ts';
import { createEndlessTrack } from '../src/features/EggRoad/endless.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { roadFinish } from '../src/features/EggRoad/finish.ts';
import { predictLanding } from '../src/features/EggRoad/landing.ts';
import { parsePublishedRun } from '../src/features/EggRoad/leaderboard.ts';
import { plausibleRoadRun } from '../src/server/roadValidation.ts';
import { saveRoadResult, bestRoadResult } from '../src/features/EggRoad/results.ts';
import { selectRoadAccount } from '../src/features/EggRoad/storage.ts';
import { flushRoadRecords, publishRoadRun, roadPublication } from '../src/features/EggRoad/recordSync.ts';
import { refreshPortal } from '../src/features/Portal/client.ts';
await initializePhysics();

test('a spinning egg over empty space has a bounded cheap landing estimate', () => {
  const sim = new RoadSimulation(createRoadTrack(2, 739, 2));
  try {
    sim.start(); sim.body.setTranslation({x:5000,y:100,z:5000},true);
    sim.body.setLinvel({x:0,y:-10,z:0},true); sim.body.setAngvel({x:60,y:0,z:0},true); sim.step(0); sim.flightTime=.8;
    const before=JSON.stringify(sim.snapshot()), cast=sim.world.castShape.bind(sim.world);let calls=0;
    sim.world.castShape=(...args)=>{calls++;assert.ok(args[3] instanceof Ball);return cast(...args)};
    assert.equal(predictLanding(sim),null); assert.ok(calls<=30,`${calls} casts`);
    assert.equal(JSON.stringify(sim.snapshot()),before);
  } finally {sim.dispose()}
});

test('the finite finish catches side landings and overshoots, with valid capped scores', async () => {
  for(const version of [1,2,3])for(const [x,z] of [[5,0],[-5,0],[0,8],[3,-4]]){
    const track=createRoadTrack(2,739,version), original=track.chunks[0].vertices.slice(), finish=roadFinish(track);
    assert.ok(finish);assert.deepEqual(track.chunks[0].vertices,original);
    const sim=new RoadSimulation(track);
    try {
      sim.start();sim.step(0);sim.seconds=90;sim.sampleIndex=track.samples.length-4;sim.nearRoad=sim.grounded=false;
      const p=finish.center.clone().addScaledVector(finish.right,x).addScaledVector(finish.tangent,z).addScaledVector(finish.normal,5);
      sim.body.setTranslation(p,true);sim.body.setLinvel(finish.normal.clone().multiplyScalar(-9),true);sim.body.setAngvel({x:0,y:0,z:0},true);
      for(let i=0;i<120&&sim.phase==='running';i++)sim.step(0);
      assert.equal(sim.phase,'finished',JSON.stringify({version,x,z,position:sim.position.toArray()}));
      const result=sim.snapshot();assert.ok(result.distance<=track.length);assert.equal(result.progress,1);
      const run=parsePublishedRun({...result,name:'Finish test'});assert.ok(run);assert.ok(await plausibleRoadRun(run));
    }finally{sim.dispose()}
  }
  assert.equal(roadFinish(createEndlessTrack(739,2)),null);
});

test('hitting the finish from underneath cannot complete the road', () => {
  const sim=new RoadSimulation(createRoadTrack(2,17,2)), finish=roadFinish(sim.track);
  try {
    sim.start();sim.step(0);sim.sampleIndex=sim.track.samples.length-1;sim.nearRoad=sim.grounded=false;
    sim.body.setTranslation(finish.center.clone().addScaledVector(finish.normal,-4),true);
    sim.body.setLinvel(finish.normal.clone().multiplyScalar(10),true);sim.body.setAngvel({x:0,y:0,z:0},true);
    for(let i=0;i<120&&sim.phase==='running';i++)sim.step(0);
    assert.notEqual(sim.phase,'finished');assert.equal(sim.gates,0);
  } finally{sim.dispose()}
});

const result=(score,code='EGG2-R-2-ABC')=>({code,mode:'seed',level:2,score,gates:1,distance:19,seconds:10,skipped:0,bestSkip:0,finished:false,breakdown:{gates:100,edge:score-100,speed:0,rhythm:0,drop:0,shortcut:0}});
test('automatic leaderboard sync keeps ownership, survives a map change, deduplicates and retries failed bests', async () => {
  const oldFetch=globalThis.fetch, oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), oldWindow=globalThis.window;
  const values=new Map();let account='Alpha', fail=false, held=null, release;
  globalThis.window=new EventTarget();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size}}});
  const posts=[];
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/portal-profile')return Response.json({account:{name:account,registered:!!account},profile:null});
    const body=JSON.parse(options.body);posts.push(body);if(held)await held;
    if(fail)throw new Error('Offline');
    return Response.json({code:body.code,entries:[],personal:{score:body.score,rank:1},total:1,name:account,registered:!!account,endlessBest:0});
  };
  try {
    await refreshPortal();const best=saveRoadResult({id:randomUUID(),owner:'alpha'},result(500)).run;
    saveRoadResult({id:randomUUID(),owner:'alpha'},result(200));
    held=new Promise(resolve=>release=resolve);const flight=flushRoadRecords();
    // Request stays alive when the player immediately starts a different map.
    const next=saveRoadResult({id:randomUUID(),owner:'alpha'},result(600,'EGG2-R-2-ABD')).run;
    const other=flushRoadRecords();assert.equal(flight,other);release();held=null;await flight;
    assert.equal(posts.length,2);assert.deepEqual(posts.map(p=>p.score),[500,600]);
    assert.ok(posts.every(p=>p.expectedOwner==='alpha'));assert.equal(roadPublication(best).status,'saved');
    await flushRoadRecords();assert.equal(posts.length,2);
    account='Beta';await refreshPortal();
    const alphaLater=saveRoadResult({id:randomUUID(),owner:'alpha'},result(700)).run;
    await flushRoadRecords();assert.equal(posts.length,2);assert.equal((await publishRoadRun(alphaLater,'Beta')).status,'account');
    account='Alpha';await refreshPortal();fail=true;await flushRoadRecords();assert.equal(roadPublication(alphaLater).status,'error');
    assert.equal(bestRoadResult(alphaLater.result.code,'alpha').published,false);
    fail=false;await publishRoadRun(alphaLater,'Alpha');assert.equal(bestRoadResult(alphaLater.result.code,'alpha').published,true);
    account='';await refreshPortal();saveRoadResult({id:randomUUID(),owner:null},result(800));const count=posts.length;
    await flushRoadRecords();assert.equal(posts.length,count,'anonymous runs need explicit publication');
    // Successful server acknowledgement must survive a quota failure locally.
    account='Alpha';await refreshPortal();const quota=saveRoadResult({id:randomUUID(),owner:'alpha'},result(900)).run;
    localStorage.setItem=()=>{throw new Error('quota')};await publishRoadRun(quota,'Alpha');
    assert.equal(bestRoadResult(quota.result.code,'alpha').published,true);await flushRoadRecords();
    assert.equal(posts.filter(p=>p.score===900).length,1);
    assert.equal(roadPublication(next).status,'saved');
  } finally {
    selectRoadAccount(null);globalThis.fetch=oldFetch;globalThis.window=oldWindow;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete globalThis.localStorage;
  }
});
