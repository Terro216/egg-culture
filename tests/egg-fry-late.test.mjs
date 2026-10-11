import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3, Group, Matrix4} from 'three';
import {applyOperation, isLargeMultiplier, operationLabel, operationTone} from '../src/features/EggFry/rules.ts';
import {bindGate, gateChoice, hasFork, LATE_GATES_FROM, makeSector, mysteryEffect, MYSTERY_HALF_WIDTH, sectorEnd} from '../src/features/EggFry/track.ts';
import {FrySimulation} from '../src/features/EggFry/simulation.ts';
import {initializeFryPhysics} from '../src/features/EggFry/physics.ts';
import {FryScenery, SCENERY_BUDGETS, SCENERY_PERIOD, sceneryTheme, sceneryZ} from '../src/features/EggFry/scenery.ts';

await initializeFryPhysics();
const gate=(salt=0)=>({id:'mystery',kind:'gate',at:35,sector:5,jackpot:false,operations:[{kind:'multiply',value:2n},{kind:'multiply',value:8n,divisor:10n,notation:'decimal'}],mystery:{salt}});

test('rational divisors and decimal multipliers are exact; printed parentheses do not change their meaning',()=>{
  const twice={kind:'divide',value:2n,divisor:4n,notation:'fraction'},loss={kind:'multiply',value:8n,divisor:10n,notation:'decimal'};
  for(const n of [1n,10n,99n,10n**100n+37n]){
    assert.equal(applyOperation(n,twice),n*2n);
    assert.equal(applyOperation(n,loss),n*8n/10n||1n);
    assert.equal(applyOperation(n,{kind:'divide',value:3n,divisor:2n}),n*2n/3n||1n);
  }
  assert.equal(operationLabel(twice,'ru'),'÷(2/4)');
  assert.equal(operationLabel(loss,'ru'),'×(0,8)');assert.equal(operationLabel(loss,'en'),'×(0.8)');
  assert.equal(operationLabel({kind:'multiply',value:2n,divisor:3n,notation:'decimal'},'en'),'×(2/3)','never approximate a non-terminating decimal');
  assert.equal(operationTone(twice),'red');assert.equal(operationTone(loss),'green');
  assert.equal(operationTone({...loss,value:16n}),'green');assert.equal(isLargeMultiplier({...loss,value:16n}),false);
  assert.equal(isLargeMultiplier({kind:'multiply',value:20n}),true);
  assert.equal(operationLabel({kind:'divide',value:2n,divisor:4n},'en'),'÷(2/4)','a rational divisor is never shown as two successive divisions');
});

test('new gates are late and rare, preserve fork crossings, and neither colour always wins',()=>{
  let mysteries=0,riddles=0,greenWins=0,redWins=0,lateSections=0;
  for(let seed=0;seed<120;seed++)for(let sector=0;sector<15;sector++){
    const rows=makeSector(seed,sector),special=rows.filter(row=>row.kind==='gate'&&(row.mystery||row.recipe==='riddle'));
    if(sector<LATE_GATES_FROM)assert.equal(special.length,0);
    if(sector>=LATE_GATES_FROM)lateSections++;
    assert.ok(rows.filter(row=>row.mystery).length<=1);
    for(const row of special){
      assert.equal(hasFork(seed,sector),false);bindGate(row,1000n);
      assert.ok(row.operations.some(op=>applyOperation(1000n,op)>1000n),'a safe ordinary alternative always exists');
      if(row.mystery){mysteries++;assert.equal(row.swap,false);assert.equal(row.mystery.revealed,undefined);}
      else riddles++;
      const red=row.operations.find(op=>operationTone(op)==='red'),green=row.operations.find(op=>operationTone(op)==='green');
      assert.ok(red&&green);
      if(applyOperation(1000n,red)>applyOperation(1000n,green))redWins++;else greenWins++;
    }
  }
  assert.ok(mysteries>60&&mysteries<lateSections*.2,'mysteries are occasional, not every section');
  assert.ok(riddles>100&&redWins>50&&greenWins>50);
});

test('all three lanes have distinct boundaries and side gates never trigger a hidden draw',()=>{
  const row=gate();
  assert.equal(gateChoice(row,0,1),'mystery');
  assert.equal(gateChoice(row,MYSTERY_HALF_WIDTH-.01,0),'mystery');
  assert.equal(gateChoice(row,-MYSTERY_HALF_WIDTH,1),0);
  assert.equal(gateChoice(row,MYSTERY_HALF_WIDTH,0),1);
  for(const x of [-2.65,2.65]){
    const sim=new FrySimulation(0);
    try{
      sim.start();sim.eggs=100n;sim.x=x;sim.resolve(row);
      assert.equal(sim.eggs,x<0?200n:80n);assert.equal(row.mystery.revealed,undefined);
    }finally{sim.dispose();}
  }
});

test('mystery effects are seeded, never instantly lethal, and only resolve once',()=>{
  const kinds=new Set();
  for(let salt=0;salt<100;salt++){
    const effect=mysteryEffect(salt);assert.deepEqual(effect,mysteryEffect(salt));kinds.add(effect.kind);
    const sim=new FrySimulation(salt);
    try{
      sim.start();sim.eggs=100n;sim.rows=[];const row=gate(salt);sim.resolve(row);
      assert.deepEqual(row.mystery.revealed,effect);assert.equal(sim.notice.kind,'mystery');
      assert.ok(sim.eggs>=50n&&sim.eggs<=300n);assert.equal(sim.phase,'running');
      const before=sim.snapshot();sim.resolve(row);assert.deepEqual(sim.snapshot(),before);
      if(effect.kind==='operation')assert.equal(applyOperation(1n,effect.operation)>0n,true);
      if(effect.kind==='shield')assert.equal(sim.shield,true);
      if(effect.kind==='cancel')assert.equal(sim.cancelCharges,1);
      if(effect.kind==='brake')assert.equal(sim.brakeCharges,1);
    }finally{sim.dispose();}
  }
  assert.deepEqual([...kinds].sort(),['brake','cancel','operation','shield']);
});

test('gate override disables every lane, and full power slots yield a useful substitute',()=>{
  const sim=new FrySimulation(0);
  try{
    sim.start();sim.rows=[gate()];sim.cancelCharges=1;
    assert.equal(sim.snapshot().mysteryAhead,true);assert.equal(sim.cancelNextGate(),true);
    assert.equal(sim.snapshot().mysteryAhead,false);sim.resolve(sim.rows[0]);
    assert.equal(sim.eggs,10n);assert.equal(sim.rows[0].mystery.revealed,undefined);assert.equal(sim.skillPoints,0);
  }finally{sim.dispose();}
  for(const kind of ['shield','cancel','brake']){
    let salt=0;while(mysteryEffect(salt).kind!==kind)salt++;
    const sim=new FrySimulation(0);
    try{
      sim.start();sim.eggs=100n;sim.shield=true;sim.cancelCharges=2;sim.brakeCharges=1;
      const row=gate(salt);sim.resolve(row);assert.equal(sim.eggs,150n);assert.equal(row.mystery.revealed.kind,'operation');
      assert.equal(sim.cancelCharges,2);assert.equal(sim.brakeCharges,1);
    }finally{sim.dispose();}
  }
});

test('a decimal numerator is not mistaken for a tenfold jackpot or an achievement',()=>{
  const sim=new FrySimulation(0);
  try{
    sim.start();const op={kind:'multiply',value:24n,divisor:10n,notation:'decimal'};
    sim.resolve({...gate(),mystery:undefined,operations:[op,op]});
    assert.equal(sim.eggs,24n);assert.equal(sim.jackpot,false);assert.equal(sim.notice.kind,'gain');
  }finally{sim.dispose();}
});

test('scenery follows travelled distance, wraps outside the road view and blends zones continuously',()=>{
  for(const parallax of [.34,.58,1,1.35]){
    const z=sceneryZ(60,10,parallax);assert.ok(Math.abs(sceneryZ(60,20,parallax)-z-10*parallax)<1e-8);
    assert.ok(Math.abs(sceneryZ(60,10+SCENERY_PERIOD/parallax,parallax)-z)<1e-8);
  }
  for(let sector=2;sector<18;sector+=3){
    const end=sectorEnd(sector),before=sceneryTheme(end-.001),after=sceneryTheme(end);
    assert.ok(before.blend>.999);assert.equal(before.next,after.index);assert.equal(after.blend,0);
  }
});

test('the richer kitchen stays in six fixed batches, outside the playable corridor, and fully disposes',()=>{
  const group=new Group(),scene=new FryScenery(group);
  try{
    assert.equal(group.children.length,6);assert.equal(scene.props.length,12);
    const matrix=new Matrix4(),bounds=new Box3();
    for(const mesh of Object.values(scene.meshes))mesh.geometry.computeBoundingBox();
    for(let i=0;i<200;i++){
      scene.update(i*23,i/3,34,false);
      for(const [name,mesh] of Object.entries(scene.meshes)){
        assert.ok(mesh.count>0&&mesh.count<=SCENERY_BUDGETS[name]);
        for(let n=0;n<mesh.count;n++){
          mesh.getMatrixAt(n,matrix);bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
          assert.ok(bounds.max.x<-5.5||bounds.min.x>5.5,`${name} ${n}: scenery must remain outside the road, including rotated and animated parts`);
        }
      }
    }
    scene.update(200,10,34,true);const still=scene.meshes.eggs.instanceMatrix.array.slice();
    scene.update(200,30,34,true);assert.deepEqual(scene.meshes.eggs.instanceMatrix.array,still,'reduced motion stops conveyor animation');
    scene.update(200,30,34,false);assert.notDeepEqual(scene.meshes.eggs.instanceMatrix.array,still);
    assert.equal(group.children.length,6);
  }finally{scene.dispose();scene.dispose();}
  assert.equal(group.children.length,0);
});
