import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, compactCount, damageForSlots, flockPoint, flockSize, FLOCK_LIMIT, FRAGMENT_LIMIT, fryCode, panDropCount, parseFryCode, slotWeight, STARTING_EGGS, tailPoint, visibleFlockSize, VISIBLE_FLOCK_LIMIT } from '../src/features/EggFry/rules.ts';
import { FrySteering } from '../src/features/EggFry/controls.ts';
import { bindGate, makeSector, gateOperations, gateSwapProgress, hazardFootprint, runningSpeed, sectorEnd, sectorStart } from '../src/features/EggFry/track.ts';
import { pilotTarget } from '../scripts/lib/fry-pilot.mjs';
import { FryTrail } from '../src/features/EggFry/trail.ts';
import { FrySimulation } from '../src/features/EggFry/simulation.ts';
import { initializeFryPhysics } from '../src/features/EggFry/physics.ts';
import { FRY_STORAGE_KEY, readFryProgress, saveFryPreferences, saveFryResult } from '../src/features/EggFry/storage.ts';

await initializeFryPhysics();

test('fry starts with ten and arithmetic remains exact beyond Number precision', () => {
  assert.equal(STARTING_EGGS, 10n);
  let eggs = STARTING_EGGS;
  for (let i = 0; i < 30; i++) eggs = applyOperation(eggs, { kind: 'multiply', value: 20n });
  assert.equal(eggs, 10n * 20n ** 30n);
  assert.equal(applyOperation(eggs, {kind:'add',value:1n}) - eggs, 1n);
  assert.equal(applyOperation(3n,{kind:'divide',value:2n}),1n);
  assert.equal(applyOperation(1n,{kind:'divide',value:2n}),1n);
  assert.equal(applyOperation(2n,{kind:'subtract',value:5n}),0n);
  assert.equal(applyOperation(0n,{kind:'multiply',value:20n}),0n);
  assert.equal(applyOperation(3n,{kind:'divide',value:0n}),3n);
  assert.equal(applyOperation(101n,{kind:'percent',value:25n}),75n);
  assert.equal(applyOperation(1000n,{kind:'percent',value:100n}),0n);
  for (const language of ['ru','en']) assert.ok(!/Infinity|NaN/.test(compactCount(eggs,language)));
});

test('bounded flock weights account for every egg exactly once', () => {
  for (const count of [1n,10n,159n,160n,161n,4800n,10n**80n+157n]) {
    const size=flockSize(count);
    assert.ok(size<=FLOCK_LIMIT);
    let sum=0n;
    for(let i=0;i<size;i++) sum+=slotWeight(count,size,i);
    assert.equal(sum,count);
    assert.equal(damageForSlots(count,size,Array.from({length:size},(_,i)=>i)),count);
    assert.equal(damageForSlots(count,size,[0,0]),slotWeight(count,size,0));
    assert.equal(damageForSlots(count,size,[-1,size+1]),0n);
  }
  assert.equal(damageForSlots(4800n,160,Array.from({length:40},(_,i)=>i)),1200n);
});

test('route codes are versioned, bounded and preserve zero', () => {
  for(const seed of [0,1,7919,0xffffffff]) assert.equal(parseFryCode(fryCode(seed)),seed);
  assert.equal(parseFryCode('FRY1-3F'),123,'old links retain their seed in the new season');
  assert.match(fryCode(1),/^FRY3-/);
  assert.equal(parseFryCode('FRY2-3F'),123);
  for(const value of [null,'FRY4-1','FRY1-','FRY1-ZZZZZZZ','https://example.com','../1']) assert.equal(parseFryCode(value),null);
});

test('thousands of seeded sectors mix penalties and switching gates without covering the entire road', () => {
  let negativePairs=0,swapping=0;
  for(let seed=0;seed<3000;seed++) for(const sector of [0,1,4,20]) {
    const rows=makeSector(seed,sector);
    assert.deepEqual(rows,makeSector(seed,sector));
    for(const row of rows)if(row.kind==='gate')bindGate(row,1000000000n);
    if(sector>0)assert.ok(rows.find(row=>row.id===`${sector}:5`).operations.every(op=>applyOperation(1000000000n,op)<=850000000n),'mandatory negative pairs cannot be outgrown by a large clutch');
    assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
    assert.equal(rows.at(-1).kind,'exit'); assert.equal(rows.at(-1).at,sectorEnd(sector));
    assert.equal(rows[0].at-sectorStart(sector),32);
    const physicalRows=rows.filter(row=>row.kind!=='modifier');
    for(let i=1;i<physicalRows.length;i++) assert.ok(physicalRows[i].at-physicalRows[i-1].at>=32);
    for(const row of rows) {
      if(row.kind==='gate') {
        if(row.operations.every(op=>['subtract','divide','percent','keep'].includes(op.kind)))negativePairs++;
        if(row.swap)swapping++;
        for(const op of row.operations)if(op.kind==='divide')assert.ok(op.value>1n);
      }
      if(row.kind==='hazard') {
        for(const distance of [0,8,16,24]) {
          const f=hazardFootprint(row,distance,distance);
          assert.ok(f.halfWidth<=3.4);
          assert.ok(Math.max(Math.abs(-5-f.x),Math.abs(5-f.x))>f.halfWidth+.35,'a leading egg always has an escape corridor');
        }
      }
    }
  }
  assert.ok(negativePairs>10000);assert.ok(swapping>10000);
});

test('relative steering ignores a second finger and retouching never teleports', () => {
  const steering=new FrySteering();
  steering.begin(1,100,400);steering.move(1,180);assert.ok(steering.target>0);
  const previous=steering.target;
  steering.begin(2,20,400);steering.move(2,390);assert.equal(steering.target,previous);
  steering.end(1);steering.begin(3,10,400);assert.equal(steering.target,previous);
  steering.move(3,10);assert.equal(steering.target,previous);
  steering.release();steering.move(3,0);assert.equal(steering.target,previous);
  steering.reset();assert.equal(steering.target,0);
});

test('speed grows with progress and abundance; exit easing lasts only eight metres', () => {
  assert.ok(runningSpeed(2,100,10n)>runningSpeed(0,100,10n)*1.2);
  assert.ok(runningSpeed(2,100,10n**30n)>runningSpeed(2,100,10n));
  assert.ok(runningSpeed(100,100,10n**500n)<=37);
  const before=runningSpeed(0,8),last=runningSpeed(0,0);
  assert.ok(last>before*.78);assert.ok(8/last<1.1);
  assert.ok(runningSpeed(0,16)>=runningSpeed(0,32));
});

test('switching gates settle before arrival and resolve their displayed final operation', () => {
  const row={id:'switch',at:32,sector:0,kind:'gate',swap:true,jackpot:false,operations:[{kind:'add',value:20n},{kind:'subtract',value:5n}]};
  assert.equal(gateSwapProgress(row,30,10),0);
  row.swapStartedAt=10;
  assert.equal(gateSwapProgress(row,11,10,10.25),0.5);
  assert.equal(gateSwapProgress(row,8,10,10.5),1);
  assert.equal(gateSwapProgress(row,-1,37,11),1);
  assert.deepEqual(gateOperations(row),[row.operations[1],row.operations[0]]);
  const sim=new FrySimulation(1);
  try { sim.start();sim.resolve(row);assert.equal(sim.eggs,5n);sim.resolve(row);assert.equal(sim.eggs,5n); }finally{sim.dispose();}
});

test('tools cross lanes, gaps grow, and pause freezes their clock', () => {
  const row={id:'motion',at:0,sector:5,kind:'hazard',hazard:'spatula',x:2.65,variant:0};
  const positions=Array.from({length:50},(_,i)=>hazardFootprint(row,0,i*.15).x);
  assert.ok(Math.min(...positions)<-2);assert.ok(Math.max(...positions)>2);
  const widths=Array.from({length:50},(_,i)=>hazardFootprint({...row,hazard:'gap'},0,i*.15).halfWidth);
  assert.ok(Math.max(...widths)-Math.min(...widths)>1.7);
});

test('a small clutch collects on visible-shell contact and consumed items never resolve twice', () => {
  const sim=new FrySimulation(5);
  try {
    sim.start();const row={id:'pick',at:5,sector:0,kind:'pickup',x:0,count:12n};
    sim.rows=[row,{id:'last',at:352,sector:0,kind:'exit'}];
    for(let i=0;i<70;i++)sim.step(0);
    assert.equal(sim.eggs,22n);assert.ok(sim.collected.has('pick'));
    sim.resolve(row);assert.equal(sim.eggs,22n);
  }finally{sim.dispose();}
});

test('the tail follows travelled distance instead of teleporting with the leaders', () => {
  const trail=new FryTrail();
  for(let i=0;i<=1000;i++)trail.push(i*.16,i<900?-3:3);
  assert.ok(trail.at(0)>2.9);assert.ok(trail.at(25)<-2.9);assert.ok(trail.size<510);
  assert.ok(flockPoint(159,160).z>5);
  assert.ok(Math.max(...Array.from({length:160},(_,i)=>flockPoint(i,160).x))<2,'the weighted tail fits a chosen branch instead of leaking into both lanes');
  assert.equal(visibleFlockSize(10n),10);assert.ok(visibleFlockSize(1000000n)>700&&visibleFlockSize(1000000n)<1000);
  assert.equal(visibleFlockSize(10n**80n),VISIBLE_FLOCK_LIMIT);
  assert.ok(tailPoint(VISIBLE_FLOCK_LIMIT-1).z>40);
});

test('moving hazards can hit trailing eggs after the leaders clear the zone, without repeat damage', () => {
  const sim=new FrySimulation(4);
  try {
    sim.start();sim.eggs=10000n;settle(sim,-2.65);
    const row={id:'tail-hit',at:0,sector:0,kind:'hazard',hazard:'spatula',x:-2.65,variant:0};
    sim.hitHazard(row,-8);const after=sim.eggs;
    assert.ok(after<10000n);sim.hitHazard(row,-8);assert.equal(sim.eggs,after);
  }finally{sim.dispose();}
});

const pilots = new WeakMap();
function steerFor(sim, exit=true) { if(!pilots.has(sim))pilots.set(sim,{});return pilotTarget(sim,pilots.get(sim),exit?1:Infinity); }
function settle(sim,x=0) { for(let i=0;i<180;i++){sim.physics.positionFlock(sim.eggs,x,i/60);sim.physics.step();} }

test('Rapier shell intersections match the visible formation and leave the opposite lane clear', () => {
  const sim=new FrySimulation(1);
  try {
    sim.eggs=160n;
    settle(sim,-2.65);
    const left={id:'test',at:0,sector:0,kind:'hazard',hazard:'spatula',x:-2.65,variant:0};
    assert.ok(sim.physics.hitSlots(left).length>25);
    const trailing=sim.physics.hitSlots(left,-8);
    assert.ok(trailing.length>0,'the tail can be hit after the leaders have passed');
    assert.ok(trailing.every(i=>sim.physics.flock[i].body.translation().z>4),'only the actual trailing shells intersect this rear tool');
    assert.equal(sim.physics.hitSlots({...left,x:2.65}).length,0);
    assert.equal(sim.physics.touchesPickup(-2.65),true);
    assert.equal(sim.physics.touchesPickup(2.65),false);
  } finally {sim.dispose();}
});

test('a complete run banks the exact clutch once and Rapier fills the pan', () => {
  const sim=new FrySimulation(123);
  try {
    assert.equal(sim.eggs,10n);sim.start();
    for(let i=0;i<4000&&sim.phase==='running';i++)sim.step(steerFor(sim));
    assert.equal(sim.phase,'frying');assert.equal(sim.result.success,true);
    assert.ok(sim.result.eggs>10n&&sim.result.eggs<1000n,'first delivery is earned without a guaranteed x20');assert.equal(sim.result.eggs,sim.eggs);
    const banked=sim.result;
    for(let i=0;i<400;i++)sim.step(0);
    assert.equal(sim.phase,'result');assert.equal(sim.result,banked);
    assert.equal(sim.snapshot().received,banked.eggs);
    assert.equal(sim.physics.fried.length,panDropCount(banked.eggs),'all representative eggs actually land and crack in the pan');
    for(const mark of sim.physics.fried)assert.ok(Math.hypot(mark.x,mark.z)<sim.physics.panRadius-.15,'the walls keep the delivery inside the pan');
    assert.equal(sim.physics.flock.length,0);
  } finally {sim.dispose();}
});

test('continuing carries the clutch through checkpoints and keeps only nearby rows', () => {
  const sim=new FrySimulation(91);
  try {
    sim.start();
    // Isolate endless generation from survival: this test deliberately removes hazards
    // and makes the route's gates positive. Survival difficulty is tested separately.
    for(let i=0;i<12000;i++) {
      sim.rows=sim.rows.filter(row=>!['hazard','modifier'].includes(row.kind));
      for(const row of sim.rows)if(row.kind==='gate'){row.recipe=undefined;row.operations=[{kind:'add',value:20n},{kind:'add',value:20n}];}
      sim.step(2.65);
    }
    assert.equal(sim.phase,'running');assert.equal(sim.result,null);
    assert.ok(sim.distance>1200);assert.ok(sim.peak>10n);
    assert.ok(sim.rows.length<=23);assert.ok(sim.physics.flock.length<=FLOCK_LIMIT);
    assert.ok(sim.physics.fragments.length<=FRAGMENT_LIMIT);
    assert.ok(sim.trail.size<600);
  } finally {sim.dispose();}
});

test('pause freezes run and frying, countdown does not advance either clock', () => {
  const sim=new FrySimulation(123);
  try {
    sim.start();for(let i=0;i<30;i++)sim.step(0);
    sim.pause();const before=sim.snapshot();for(let i=0;i<100;i++)sim.step(3);
    assert.deepEqual(sim.snapshot(),before);sim.resume();
    for(let i=0;i<120;i++)sim.step(3);
    assert.equal(sim.phase,'countdown');assert.equal(sim.seconds,before.seconds);
    for(let i=0;i<70;i++)sim.step(0);
    assert.equal(sim.phase,'running');
    for(let i=0;i<4000&&sim.phase==='running';i++)sim.step(steerFor(sim));
    sim.pause();const time=sim.fryTime;for(let i=0;i<120;i++)sim.step(0);
    assert.equal(sim.fryTime,time);
    sim.resume();for(let i=0;i<200;i++)sim.step(0);
    assert.equal(sim.phase,'frying');assert.ok(sim.fryTime>time);
    const delivered=sim.result.eggs;sim.skipFrying();assert.equal(sim.snapshot().received,delivered);
  } finally {sim.dispose();}
});

test('identical fixed steps grouped into 30 or 60 fps frames have identical results', () => {
  const run=stepsPerFrame=>{
    const sim=new FrySimulation(28);sim.start();
    try {
      for(let frame=0;frame<1200/stepsPerFrame;frame++)for(let step=0;step<stepsPerFrame;step++)sim.step(Math.sin(sim.seconds*.6)*2.8);
      return {eggs:sim.eggs,peak:sim.peak,distance:sim.distance,x:sim.x,phase:sim.phase};
    }finally{sim.dispose();}
  };
  assert.deepEqual(run(1),run(2));assert.deepEqual(run(2),run(4));
});

test('carton absorbs one obstacle event, while arithmetic still applies to the eggs', () => {
  const sim=new FrySimulation(12);
  try {
    sim.start();sim.shield=true;sim.eggs=100n;settle(sim);
    const row={id:'impact',at:1,sector:0,kind:'hazard',hazard:'spatula',x:0,variant:0};
    sim.hitHazard(row,0);assert.equal(sim.eggs,100n);assert.equal(sim.shield,false);
    sim.hitHazard(row,0);assert.equal(sim.eggs,100n,'same impact cannot consume twice');
    sim.shield=true;
    sim.resolve({id:'divide',at:2,sector:0,kind:'gate',jackpot:false,operations:[{kind:'divide',value:2n},{kind:'divide',value:2n}]});
    assert.equal(sim.eggs,50n);assert.equal(sim.shield,true);
    settle(sim);
    const gap={...row,id:'gap',hazard:'gap'};
    sim.hitHazard(gap,0);assert.equal(sim.eggs,50n);
    assert.equal(sim.shield,false,'the box breaks on a pit and preserves the clutch for this crossing');
    sim.hitHazard(gap,0);assert.equal(sim.eggs,50n);
  } finally {sim.dispose();}
});

test('complete loss produces an empty pan and cannot turn peak count into a score', () => {
  const sim=new FrySimulation(1);
  try {
    sim.start();sim.peak=100000n;
    sim.resolve({id:'zero',at:1,sector:0,kind:'gate',jackpot:false,operations:[{kind:'subtract',value:100n},{kind:'subtract',value:100n}]});
    assert.equal(sim.eggs,0n);assert.equal(sim.result.success,false);assert.equal(sim.result.eggs,0n);
    for(let i=0;i<150;i++)sim.step(0);
    assert.equal(sim.phase,'result');assert.equal(sim.physics.fried.length,0);assert.equal(sim.snapshot().received,0n);
  }finally{sim.dispose();}
});

test('progress stores exact scores, rewards delivered eggs, and tolerates unavailable storage', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  try {
    values.set(FRY_STORAGE_KEY,'broken');assert.equal(readFryProgress().best,'0');
    const result={eggs:10n**50n+1n,peak:10n**51n,seconds:50,sector:1,seed:0,success:true,losses:0,jackpot:true};
    const saved=saveFryResult(result);assert.equal(saved.newBest,true);assert.equal(readFryProgress().best,result.eggs.toString());
    assert.ok(saved.unlocked.includes('thousand'));assert.ok(saved.unlocked.includes('clean'));
    saveFryResult({...result,success:false,eggs:10n**60n});assert.equal(readFryProgress().best,result.eggs.toString());
    saveFryPreferences({muted:false,reducedMotion:true});assert.equal(readFryProgress().muted,false);assert.equal(readFryProgress().best,result.eggs.toString());
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked')}});
    assert.equal(readFryProgress().best,'0');assert.doesNotThrow(()=>saveFryResult(result));
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
