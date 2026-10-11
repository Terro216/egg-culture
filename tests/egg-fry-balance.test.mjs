import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, operationLabel, operationValue, panDropCount, panFill, panMarkSize, panSpread, STEP, visibleFlockSize } from '../src/features/EggFry/rules.ts';
import { bindGate, forkGap, gateSwapProgress, hasFork, makeSector, roadIntervals, sectorStart, subtractInterval } from '../src/features/EggFry/track.ts';
import { FryPhysics, initializeFryPhysics } from '../src/features/EggFry/physics.ts';
import { FrySimulation } from '../src/features/EggFry/simulation.ts';
import { FrySteering } from '../src/features/EggFry/controls.ts';
import { sizzleSamples } from '../src/features/EggFry/audio.ts';
import { pilotTarget } from '../scripts/lib/fry-pilot.mjs';

await initializeFryPhysics();
const board = (recipe, salt=1, sector=0) => ({id:'board',kind:'gate',at:32,sector,recipe,salt,jackpot:false,operations:[]});

test('late expressions have exact BigInt semantics and match the printed order of operations', () => {
  const n=10n**80n+31n;
  assert.equal(applyOperation(n,{kind:'multiply',value:5n,divisor:3n}),n*5n/3n);
  assert.equal(applyOperation(n,{kind:'divide',value:2n,power:2}),n/4n);
  assert.equal(applyOperation(n,{kind:'subtract',value:5n,power:2,unit:1000000n}),n-25000000n);
  assert.equal(applyOperation(n,{kind:'keep',value:4n}),n*4n/100n);
  assert.equal(operationLabel({kind:'multiply',value:5n,divisor:3n},'en'),'×5 ÷ 3');
  assert.equal(operationLabel({kind:'subtract',value:5n,power:2,unit:1000000n},'ru'),'−5² × 1 млн');
  assert.equal(operationLabel({kind:'divide',value:2n,power:2},'ru'),'÷2²');
  assert.equal(operationLabel({kind:'keep',value:4n},'en'),'Keep 4%');
  assert.equal(applyOperation(1n,{kind:'keep',value:4n}),1n);
});

test('adaptive additions compete with multipliers at millions, billions and arbitrary precision', () => {
  for(const count of [30000000n,61000000000n,2000000000000n,10n**100n]) {
    let additionWins=0,multiplicationWins=0;
    for(let salt=0;salt<200;salt++) {
      const row=board('reward',salt,5);bindGate(row,count);
      const plus=row.operations.find(op=>op.kind==='add'),times=row.operations.find(op=>op.kind==='multiply');
      assert.ok(operationValue(plus)>=count/4n,'no trivial fixed pickup masquerading as a gate choice');
      if(applyOperation(count,plus)>applyOperation(count,times))additionWins++;else multiplicationWins++;
    }
    assert.ok(additionWins>60&&multiplicationWins>60,'neither prefix predicts the better reward');
  }
});

test('penalty alternatives are meaningfully different; fatal subtraction always leaves another option', () => {
  for(let salt=0;salt<500;salt++)for(const count of [100n,30000000n,10n**90n]) {
    const tax=board('tax',salt,8);bindGate(tax,count);
    const values=tax.operations.map(op=>applyOperation(count,op)).sort((a,b)=>a<b?-1:1);
    assert.ok(values[1]<=count*85n/100n);
    assert.ok(values[1]>=values[0]*2n,'not -40% versus -45%');
    const risk=board('risk',salt,8);bindGate(risk,count);
    const lethal=risk.operations.find(op=>op.kind==='subtract');
    assert.ok(operationValue(lethal)>=count);assert.equal(applyOperation(count,lethal),0n);
    assert.equal(risk.operations.filter(op=>applyOperation(count,op)>0n).length,1);
  }
});

test('only the next visible gate binds, then its printed values remain fixed after changes in the clutch', () => {
  const sim=new FrySimulation(3);
  try {
    assert.equal(sim.rows[0].reference,10n);
    const second=sim.rows.find(row=>row.kind==='gate'&&row.at===96);
    assert.equal(second.reference,undefined);
    sim.start();while(sim.distance<30)sim.step(-2.65);
    assert.equal(second.reference,22n);
    const operations=structuredClone(second.operations);
    sim.eggs=100000000000n;
    for(let i=0;i<3;i++)sim.step(-2.65);
    assert.deepEqual(second.operations,operations);
    bindGate(second,1n);assert.deepEqual(second.operations,operations);
  }finally{sim.dispose();}
});

test('time-driven gate swaps never hang or reverse when the speed changes', () => {
  const row={...board('reward'),swap:true,swapStartedAt:20};
  let previous=0;
  for(let i=0;i<=60;i++) {
    const progress=gateSwapProgress(row,50-i,i%2?12:37,20+i/120);
    assert.ok(progress>=previous);
    assert.ok(Math.abs(progress-i/60)<1e-12);
    previous=progress;
  }
  assert.equal(gateSwapProgress(row,100,3,21),1);
});

test('physical growth is gradual, weights stay exact, and struck identities do not respawn', () => {
  const physics=new FryPhysics();
  try {
    physics.positionFlock(10n,0,0);physics.step();
    assert.equal(physics.flock.length,10);
    const count=10n**50n+7n;
    physics.positionFlock(count,0,STEP);physics.step();
    assert.ok(physics.flock.length>10&&physics.flock.length<20);
    assert.equal(physics.count,count);
    for(let i=0;i<120;i++){physics.positionFlock(count,0,i*STEP);physics.step();assert.equal(physics.count,count);}
    assert.equal(physics.flock.length,160);
    const indices=physics.flock.flatMap((_,i)=>i%2===0?[i]:[]),ids=new Set(indices.map(i=>physics.flock[i].id));
    const expected=indices.reduce((sum,i)=>sum+physics.flock[i].weight,0n),loss=physics.removeSlots(indices,true);
    assert.equal(loss,expected);assert.equal(physics.fragments.length,80);
    const survivors=physics.flock.map(egg=>({id:egg.id,slot:egg.slot,weight:egg.weight}));
    for(let i=0;i<90;i++){physics.positionFlock(count-loss,0,i*STEP);physics.step();}
    assert.deepEqual(physics.flock.map(egg=>({id:egg.id,slot:egg.slot,weight:egg.weight})),survivors);
    assert.ok(physics.flock.every(egg=>!ids.has(egg.id)));assert.equal(physics.count,count-loss);
  }finally{physics.dispose();}
});

test('a whole small clutch over a hole loses every egg and visibly falls before the result', () => {
  const sim=new FrySimulation(5);
  try {
    sim.rows=[{id:'hole',kind:'hazard',hazard:'gap',at:12,sector:8,x:0,variant:Math.PI/2}];sim.start();
    for(let i=0;i<150&&sim.phase==='running';i++)sim.step(0);
    assert.equal(sim.phase,'falling');assert.equal(sim.eggs,0n);
    assert.equal(sim.physics.flock.length,0);assert.equal(sim.physics.fried.length,0);
    assert.equal(sim.physics.fragments.length,10,'all ten shells remain visible in the falling animation');
    const y=sim.physics.fragments[0].body.translation().y;
    for(let i=0;i<10;i++)sim.step(0);
    assert.ok(sim.physics.fragments[0].body.translation().y<y);
    sim.pause();const frozen=sim.fryTime;for(let i=0;i<50;i++)sim.step(0);assert.equal(sim.fryTime,frozen);
    sim.resume();for(let i=0;i<300;i++)sim.step(0);
    assert.equal(sim.phase,'result');assert.equal(sim.result.eggs,0n);
  }finally{sim.dispose();}
});

test('without a carton the central egg can reach the edge and side eggs really fall', () => {
  const sim=new FrySimulation(5);
  try {
    sim.rows=[];sim.start();
    for(let i=0;i<120;i++)sim.step(5.3);
    assert.ok(sim.x>5.29);assert.ok(sim.eggs>0n&&sim.eggs<10n);
    assert.ok(sim.physics.flock.some(egg=>egg.slot===0&&egg.body.translation().x>5.25),'the actual central shell approaches the edge');
    for(let i=0;i<90&&sim.phase==='running';i++)sim.step(5.8);
    assert.ok(sim.x>5.5);assert.ok(!sim.physics.flock.some(egg=>egg.slot===0),'the central shell itself can fall');
  }finally{sim.dispose();}
});

test('gate override consumes one charge and never changes the other gates; cooling freezes in pause', () => {
  const sim=new FrySimulation(12);
  try {
    sim.cancelCharges=2;assert.equal(sim.cancelNextGate(),false);sim.start();
    assert.equal(sim.cancelNextGate(),true);assert.equal(sim.cancelNextGate(),false);assert.equal(sim.cancelCharges,1);
    assert.equal(sim.rows.filter(row=>row.cancelled).length,1);
    while(sim.distance<30)sim.step(0);
    assert.equal(sim.eggs,10n);assert.equal(sim.cancelCharges,1);
    assert.equal(sim.cancelNextGate(),true);assert.equal(sim.cancelCharges,0);
    sim.brakeCharges=1;const speed=sim.speed,time=sim.motionTime;
    assert.equal(sim.useBrake(),true);assert.equal(sim.useBrake(),false);assert.ok(sim.speed<speed*.63);
    sim.step(0);assert.ok(Math.abs(sim.motionTime-time-STEP*.55)<1e-9);
    sim.pause();const before=sim.snapshot();for(let i=0;i<300;i++)sim.step(0);assert.deepEqual(sim.snapshot(),before);
    sim.resume();for(let i=0;i<181;i++)sim.step(0);
    assert.ok(sim.snapshot().brakeRemaining>3.9);
  }finally{sim.dispose();}
});

test('power pickups disappear once, charges are bounded, and do not masquerade as tray protection', () => {
  const sim=new FrySimulation(1);
  try {
    sim.rows=[{id:'power',kind:'power',power:'cancel',at:5,x:0,sector:0}];sim.start();
    for(let i=0;i<70;i++)sim.step(0);
    assert.equal(sim.cancelCharges,1);assert.equal(sim.shield,false);assert.ok(sim.collected.has('power'));
    sim.resolve(sim.rows[0]);assert.equal(sim.cancelCharges,1);
    for(let i=0;i<6;i++)sim.resolve({id:`extra${i}`,kind:'power',power:'cancel',at:sim.distance,x:0,sector:0},3.2);
    assert.equal(sim.cancelCharges,2);
    for(let i=0;i<3;i++)sim.resolve({id:`brake${i}`,kind:'power',power:'brake',at:sim.distance,x:0,sector:0},3.2);
    assert.equal(sim.brakeCharges,1);
  }finally{sim.dispose();}
});

test('temporary inversion gives warning and rebases an active finger without moving the target', () => {
  const steering=new FrySteering();steering.begin(1,100,400);steering.move(1,180);
  const target=steering.target;steering.setInverted(true);assert.equal(steering.target,target);
  steering.move(1,180);assert.equal(steering.target,target);steering.move(1,190);assert.ok(steering.target<target);
  const reversed=steering.target;steering.setInverted(false);steering.move(1,190);assert.equal(steering.target,reversed);
  steering.keyboard(1,STEP);assert.ok(steering.target>reversed);
  const sim=new FrySimulation(0);
  try {
    sim.rows=[];sim.start();sim.resolve({id:'invert',kind:'modifier',effect:'invert',at:0,sector:3});
    assert.ok(sim.snapshot().invertPending>=1.4);assert.equal(sim.inverted,false);
    for(let i=0;i<90;i++)sim.step(0);assert.equal(sim.inverted,true);
    sim.pause();const before=sim.snapshot();for(let i=0;i<100;i++)sim.step(0);assert.deepEqual(sim.snapshot(),before);
    sim.resume();for(let i=0;i<540;i++)sim.step(0);assert.equal(sim.inverted,false);
    for(let seed=0;seed<30;seed++)for(let sector=0;sector<3;sector++)assert.ok(!makeSector(seed,sector).some(row=>row.kind==='modifier'));
  }finally{sim.dispose();}
});

test('late road splits have real support intervals and leave the checkpoint approach intact', () => {
  const seed=0,sector=4,start=sectorStart(sector);
  assert.equal(hasFork(seed,sector),true);assert.equal(forkGap(seed,start+100),0);
  assert.deepEqual(roadIntervals(seed,start+124),[[-5.5,-.6],[.6,5.5]]);
  assert.deepEqual(roadIntervals(seed,start+170),[[-5.5,5.5]],'a full-width crossing precedes the next gate');
  assert.deepEqual(roadIntervals(seed,start+320),[[-5.5,5.5]]);
  assert.deepEqual(subtractInterval([[-5.5,5.5]],-2,3),[[-5.5,-2],[3,5.5]]);
  const physics=new FryPhysics();
  try {
    physics.positionFlock(3n,0,0);physics.step();assert.equal(physics.unsupportedSlots(seed,start+124).length,3);
    assert.equal(physics.unsupportedSlots(seed,start+100).length,0);
  }finally{physics.dispose();}
});

test('crowd growth and pan coverage are proportional and bounded, including a real ninety-egg delivery', () => {
  assert.equal(visibleFlockSize(161n),160);assert.ok(visibleFlockSize(320n)<220);
  assert.ok(visibleFlockSize(1000000n)<visibleFlockSize(1000000000n));
  assert.equal(panDropCount(90n),90);assert.ok(panDropCount(10n**40n)<=480);
  assert.ok(panFill(90n)<.15);assert.equal(panFill(10n**40n),1);
  assert.ok(panMarkSize(90n)<panMarkSize(10n**40n)/2);
  assert.ok(panSpread(90n)<panSpread(10n**40n)/2);
  const physics=new FryPhysics();
  try {
    physics.beginPan(90n);let dropped=0;
    for(let i=0;i<240;i++) {if(dropped<90)physics.dropIntoPan(dropped++,90);physics.step();}
    assert.equal(physics.fried.length,90);
    assert.ok(physics.fried.every(mark=>Math.hypot(mark.x,mark.z)<physics.panRadius*.6));
    const area=physics.fried.reduce((sum,mark)=>sum+Math.PI*mark.size**2*1.2,0)/(Math.PI*physics.panRadius**2);
    assert.ok(area<.2,'ninety eggs occupy a small serving, not the whole pan');
  }finally{physics.dispose();}
});

test('procedural frying noise is finite, quiet and has no cumulative low-frequency drift', () => {
  let state=19;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  const samples=sizzleSamples(96000,48000,random);
  let sum=0,squares=0,adjacent=0,max=0;
  for(let i=0;i<samples.length;i++){const v=samples[i];assert.ok(Number.isFinite(v));sum+=v;squares+=v*v;max=Math.max(max,Math.abs(v));if(i)adjacent+=v*samples[i-1];}
  assert.ok(Math.abs(sum/samples.length)<.005);assert.ok(max<.7);
  assert.ok(Math.sqrt(squares/samples.length)*.12*.45<.016);
  assert.ok(Math.abs(adjacent/squares)<.02,'white source before the 750–5200 Hz filtering, not red rumble');
});

test('standing on the right is unreliable past four pans; attentive opening play usually banks the first', () => {
  let passivePastFour=0,activeDeliveries=0;
  for(let seed=1;seed<=16;seed++)for(const passive of [true,false]) {
    const sim=new FrySimulation(seed),state={};
    try {
      sim.start();for(let i=0;i<12000&&sim.phase==='running';i++)sim.step(passive?3.55:pilotTarget(sim,state));
      if(passive&&sim.distance>1360)passivePastFour++;
      if(!passive&&sim.result?.success)activeDeliveries++;
    }finally{sim.dispose();}
  }
  assert.ok(passivePastFour<=4,`at least three quarters of idle attempts end before four pans (${passivePastFour}/16 escaped)`);
  assert.ok(activeDeliveries>=14,`first delivery remains achievable (${activeDeliveries}/16)`);
});
