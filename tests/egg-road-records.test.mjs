import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoadRecordStore, roadRecordStore } from '../src/server/roadRecords.ts';
import { parsePublishedRun, canonicalRoadCode } from '../src/features/EggRoad/leaderboard.ts';
import { readTrackBest, saveTrackScore, readPointsBest, saveRoadScore } from '../src/features/EggRoad/storage.ts';
import { createRoadTrack } from '../src/features/EggRoad/track.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { GET, POST } from '../src/pages/api/egg-road-records.ts';

const run = (score=100, code='EGG1-R-2-ABC') => ({ code, name:'Путник', score, gates:Math.floor(score/100), distance:Math.floor(score/100)*18+1, seconds:10, finished:false, breakdown:{gates:score,edge:0,speed:0,rhythm:0,drop:0,shortcut:0} });

test('personal records belong to canonical seeds, while the card best only uses endless mode', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), data=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}});
  try {
    saveRoadScore('practice',9000);saveRoadScore('endless',1000);
    assert.equal(readTrackBest('EGG1-R-1-0'),0,'the old score has no seed to migrate');
    saveTrackScore('egg1-r-2-abc',500);saveTrackScore('EGG1-R-2-ABC',400);
    saveTrackScore('EGG1-E-2-ABC',600);
    assert.equal(readTrackBest('EGG1-R-2-ABC'),500);
    assert.equal(readTrackBest('EGG1-E-2-ABC'),600);
    assert.equal(readTrackBest('EGG1-R-2-ABD'),0);
    saveTrackScore('EGG1-R-1-9',30);assert.equal(readTrackBest('EGG1-R-1-0'),30);
    assert.equal(readPointsBest('endless'),1000);
    saveTrackScore('invalid',10);saveTrackScore('EGG1-R-2-ABC',NaN);
    assert.equal(readTrackBest('EGG1-R-2-ABC'),500);
  } finally { if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage; }
});

test('leaderboards preserve best runs across reopen, isolate seeds, share ties, and never expose player identifiers', async () => {
  const dir=await mkdtemp(join(tmpdir(),'egg-road-records-'));
  let store=createRoadRecordStore(dir);
  try {
    store.submit('alice',run(100));store.submit('bob',run(200));store.submit('carol',run(200));
    store.submit('alice',run(300,'EGG1-E-2-ABC'));
    store.submit('alice',run(100,'EGG1-R-2-ABD'));
    store.submit('bob',run(100));store.submit('bob',run(200));
    store.close();store=createRoadRecordStore(dir);
    const board=store.read('EGG1-R-2-ABC','alice');
    assert.deepEqual(board.entries.map(r=>r.score),[200,200,100]);
    assert.deepEqual(board.entries.map(r=>r.rank),[1,1,3]);
    assert.equal(board.personal.rank,3);assert.equal(board.total,3);assert.equal(board.endlessBest,300);
    assert.equal(board.entries.filter(r=>r.mine).length,1);
    assert.ok(!JSON.stringify(board).includes('alice'));
    store.submit('alice',{...run(400),name:'Новое имя'});
    assert.equal(store.read('EGG1-R-2-ABC','alice').personal.rank,1);
    assert.equal(store.read('EGG1-R-2-ABC','alice').personal.name,'Новое имя');
    for(let i=0;i<25;i++)store.submit(`p${i}`,run(500+i*100));
    const distant=store.read('EGG1-R-2-ABC','bob');
    assert.equal(distant.entries.length,20);assert.ok(distant.personal.rank>20);
    assert.equal(store.read('EGG1-R-2-ABD','alice').personal.score,100);
    assert.equal(store.read('EGG1-E-2-ABC','alice').personal.score,300);
  } finally { store.close();await rm(dir,{recursive:true,force:true}); }
});

test('published run validation rejects malformed seeds, impossible totals and unsafe names', () => {
  assert.ok(parsePublishedRun(run()));
  assert.equal(canonicalRoadCode('egg1-r-1-abc'),'EGG1-R-1-0');
  for(const extra of [{code:'../../private'},{name:'<img src=x>'},{name:'x\u202Ey'},{name:' '.repeat(5)},{name:'я'.repeat(33)},{score:Infinity},{gates:-1},{distance:500},{seconds:0},{breakdown:{...run().breakdown,edge:100}},{code:'EGG1-E-2-ABC',finished:true}]) assert.equal(parsePublishedRun({...run(),...extra}),null);
});

test('HTTP records use an opaque browser cookie, protect writes, bound payloads and throttle repeated submissions', async () => {
  const dir=await mkdtemp(join(tmpdir(),'egg-road-api-'));
  process.env.EGG_ROAD_DATA_DIR=dir;
  const origin='https://egg.example';
  function client(ip){
    const values=new Map(), attributes=[];
    return {values,attributes,context(method,body,headers={},code='EGG1-R-2-ABC') {
      const url=new URL(`${origin}/api/egg-road-records?code=${code}`);
      return {url,site:new URL(origin),clientAddress:ip,
        request:new Request(url,{method,headers:{origin,'content-type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),
        cookies:{get:name=>values.has(name)?{value:values.get(name)}:undefined,set:(name,value,options)=>{values.set(name,value);attributes.push(options);}},
      };
    }};
  }
  try {
    const a=client('192.0.2.1'),b=client('192.0.2.2');
    const response=await GET(a.context('GET'));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).total,0);
    assert.match(a.values.get('egg_road_player'),/^[a-f0-9]{64}$/);
    assert.deepEqual(a.attributes[0],{httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:31536000});
    assert.equal((await POST(a.context('POST',run(),{origin:'https://elsewhere.example'}))).status,403);
    assert.equal((await POST(a.context('POST',run(),{'content-type':'text/plain'}))).status,415);
    assert.equal((await POST(a.context('POST','x'.repeat(9000)))).status,413);
    assert.equal((await POST(a.context('POST',{...run(),score:NaN}))).status,400);
    assert.equal((await GET(a.context('GET',null,{},'../private'))).status,400);
    let published=await POST(a.context('POST',run(200)));
    assert.equal(published.status,200);assert.equal((await published.json()).personal.score,200);
    await POST(a.context('POST',run(100)));await POST(a.context('POST',run(200)));
    const own=await (await GET(a.context('GET'))).json();assert.equal(own.total,1);assert.equal(own.personal.score,200);
    const other=await (await GET(b.context('GET'))).json();assert.equal(other.personal,null);assert.equal(other.entries[0].mine,false);
    await POST(b.context('POST',run(300,'EGG1-E-2-ABC')));
    assert.equal((await (await GET(b.context('GET',null,{},'EGG1-E-2-ABC'))).json()).personal.score,300);
    let limited=false;
    for(let i=0;i<25;i++)if((await POST(a.context('POST',run()))).status===429)limited=true;
    assert.ok(limited);assert.equal((await (await GET(a.context('GET'))).json()).personal.score,200);
  } finally { roadRecordStore().close();delete process.env.EGG_ROAD_DATA_DIR;await rm(dir,{recursive:true,force:true}); }
});

test('real airborne physics preserves rhythm without earning points and resumes after landing', async () => {
  await initializePhysics();
  const sim=new RoadSimulation(createRoadTrack());
  try {
    sim.start();for(let i=0;i<50;i++)sim.step(0);
    const surface=sim.track.samples[300];
    sim.body.setTranslation(surface.position.clone().addScaledVector(surface.normal,25),true);
    sim.body.setLinvel({x:0,y:0,z:0},true);sim.body.setAngvel({x:0,y:0,z:0},true);
    sim.step(0); // Let the actual contact detector register the departure.
    sim.rhythm.charge=.7;sim.rhythm.chain=4;
    const heldCharge=sim.rhythm.charge;
    const rhythmPoints=sim.scoring.totals.rhythm;
    for(let i=0;i<100;i++)sim.step(i%2?1:-1);
    assert.equal(sim.grounded,false);assert.equal(sim.rhythm.chain,4);assert.equal(sim.rhythm.charge,heldCharge);
    assert.equal(sim.scoring.totals.rhythm,rhythmPoints);
    let landed=false;
    for(let i=0;i<160;i++){sim.step(0);if(sim.grounded){landed=true;break;}}
    assert.ok(landed);assert.equal(sim.rhythm.chain,4);
    assert.ok(sim.scoring.totals.rhythm>rhythmPoints);
    const payload={...sim.snapshot(),name:'Игрок'};
    assert.ok(parsePublishedRun(payload),'a real engine result is accepted by the API contract');
    sim.reset();assert.equal(sim.rhythm.chain,0);assert.equal(sim.rhythm.charge,0);
  } finally {sim.dispose();}
});
