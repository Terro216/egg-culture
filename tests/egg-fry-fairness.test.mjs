import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, CARTON_HALF_DEPTH, CARTON_HALF_WIDTH, CARTON_Z, collectionMultiplier, flockPoint, STEP } from '../src/features/EggFry/rules.ts';
import { forkGap, hasFork, makeSector, roadIntervals, sectorEnd, sectorStart } from '../src/features/EggFry/track.ts';
import { initializeFryPhysics, FryPhysics } from '../src/features/EggFry/physics.ts';
import { FrySimulation } from '../src/features/EggFry/simulation.ts';
import { FrySteering } from '../src/features/EggFry/controls.ts';

await initializeFryPhysics();
const gate=(id,operations)=>({id,kind:'gate',at:32,sector:0,jackpot:false,operations});
const settle=(sim,x=sim.x)=>{
  sim.x=x;
  sim.trail.push(sim.distance-80,x);sim.trail.push(sim.distance,x);
  for(let i=0;i<150;i++){
    sim.physics.positionFlock(sim.eggs,x,i*STEP,sim.trail,{seed:sim.seed,distance:sim.distance,carton:sim.shield});
    sim.physics.step();
  }
};

test('a positive percentage or division never kills the last egg, but explicit zero still does',()=>{
  for(let n=1n;n<=150n;n++){
    for(const op of [{kind:'keep',value:4n},{kind:'percent',value:99n},{kind:'divide',value:1000n},{kind:'multiply',value:1n,divisor:1000n}]){
      const result=applyOperation(n,op);assert.ok(result>=1n&&result<=n);
    }
    for(const op of [{kind:'keep',value:0n},{kind:'percent',value:100n},{kind:'subtract',value:n},{kind:'multiply',value:0n}])assert.equal(applyOperation(n,op),0n);
  }
  const sim=new FrySimulation(0);
  try{
    sim.start();sim.resolve(gate('share',[{kind:'keep',value:4n},{kind:'keep',value:4n}]));
    assert.equal(sim.eggs,1n);assert.equal(sim.phase,'running');assert.equal(sim.result,null);
    sim.rows=[];for(let i=0;i<150;i++)sim.step(0);
    assert.equal(sim.eggs,1n);assert.equal(sim.physics.count,1n);
  }finally{sim.dispose();}
});

test('growth extends stable slots; +25 next to either edge never creates a net loss without steering',()=>{
  assert.deepEqual(flockPoint(30,40),flockPoint(30,160));
  for(const side of [-1,1])for(const initial of [10n,160n,1000000n]){
    const sim=new FrySimulation(2);
    try{
      sim.rows=[];sim.eggs=initial;settle(sim,side*4.1);sim.start();
      assert.equal(sim.physics.unsupportedSlots(2,sim.distance).length,0);
      const before=sim.physics.flock.map(egg=>({id:egg.id,x:egg.body.translation().x,offset:egg.offsetX}));
      sim.resolve({id:'plus25',kind:'pickup',at:sim.distance+3.2,x:sim.x,count:25n,sector:0},3.2);
      assert.equal(sim.eggs,initial+25n);
      for(let i=0;i<180;i++)sim.step(side*4.1);
      assert.equal(sim.eggs,initial+25n);assert.equal(sim.physics.count,sim.eggs);assert.equal(sim.losses,0);
      for(const old of before){
        const now=sim.physics.flock.find(egg=>egg.id===old.id);
        assert.ok(now);assert.equal(now.offsetX,old.offset);assert.ok(Math.abs(now.body.translation().x-old.x)<1e-4);
      }
      for(let i=0;i<120&&sim.phase==='running';i++)sim.step(side*5.6);
      assert.ok(sim.eggs<initial+25n,'deliberate steering into an edge still has consequences');
    }finally{sim.dispose();}
  }
});

test('a live carton confines every representative and prevents edge losses even at enormous counts',()=>{
  const sim=new FrySimulation(5);
  try{
    sim.rows=[];sim.eggs=10n**60n+9n;sim.shield=true;settle(sim);sim.start();
    for(let i=0;i<210;i++)sim.step(5.8);
    assert.equal(sim.eggs,10n**60n+9n);assert.equal(sim.physics.count,sim.eggs);
    assert.ok(sim.x<=5.5-CARTON_HALF_WIDTH-.09);assert.equal(sim.losses,0);
    assert.equal(sim.physics.flock.length,160);
    for(const egg of sim.physics.flock){
      const p=egg.body.translation();assert.ok(Math.abs(p.x-sim.x)<CARTON_HALF_WIDTH-.2);
      assert.ok(Math.abs(p.z-CARTON_Z)<CARTON_HALF_DEPTH-.2);
    }
    assert.deepEqual(sim.physics.unsupportedSlots(sim.seed,sim.distance),[]);
  }finally{sim.dispose();}
});

test('gathering shells outside the box cannot collect or collide on behalf of the boxed clutch',()=>{
  const sim=new FrySimulation(1);
  try{
    sim.rows=[];sim.eggs=10000n;settle(sim,2.65);sim.start();sim.shield=true;
    sim.physics.flock[0].body.setTranslation({x:-4.5,y:.3,z:-3.2},true);
    sim.physics.positionFlock(sim.eggs,sim.x,0,sim.trail,{seed:1,distance:0,carton:true});
    assert.equal(sim.physics.touchesPickup(-4.5,3.2),false);
    const outside={id:'outside',kind:'hazard',hazard:'spatula',at:0,sector:0,x:-4.5,variant:0};
    assert.deepEqual(sim.physics.hitSlots(outside,3.2),[]);
    sim.hitHazard(outside,3.2);assert.equal(sim.eggs,10000n);assert.equal(sim.shield,true);
  }finally{sim.dispose();}
});

test('a carton breaks once on a tool or pit, then safely unfolds into a vulnerable tail',()=>{
  for(const hazard of ['spatula','gap']){
    const sim=new FrySimulation(2);
    try{
      sim.rows=[];sim.eggs=10000n;sim.shield=true;settle(sim,3.8);sim.start();
      const row={id:'first',kind:'hazard',hazard,at:sim.distance,sector:0,x:hazard==='gap'?sim.x/.7:sim.x,variant:0};
      sim.hitHazard(row,.7);assert.equal(sim.shield,false);assert.equal(sim.eggs,10000n);
      for(let i=0;i<150;i++){sim.step(3.8);sim.hitHazard(row,.7);}
      assert.equal(sim.eggs,10000n,'the same obstacle and unpacking cannot take the saved clutch');
      assert.equal(sim.physics.carton,false);assert.ok(sim.physics.flock.some(egg=>egg.body.translation().z>7));
      sim.hitHazard({...row,id:'second'},.7);assert.ok(sim.eggs<10000n,'the next obstacle is dangerous again');
    }finally{sim.dispose();}
  }
});

test('the carton does not override fatal gate arithmetic',()=>{
  const sim=new FrySimulation(0);
  try{
    sim.start();sim.shield=true;
    sim.resolve(gate('fatal',[{kind:'subtract',value:10n},{kind:'subtract',value:11n}]));
    assert.equal(sim.eggs,0n);assert.equal(sim.phase,'falling');assert.equal(sim.shield,false);
  }finally{sim.dispose();}
});

test('releasing a boxed steering limit rebases an active finger without a latent outward jump',()=>{
  const steering=new FrySteering();steering.begin(1,100,390);steering.move(1,260);
  assert.equal(steering.target,5.8);steering.reanchor(4);
  steering.move(1,260);assert.equal(steering.target,4);
  steering.move(1,265);assert.ok(steering.target>4&&steering.target<4.3);
  const sim=new FrySimulation(0);
  try{
    sim.rows=[];sim.shield=true;sim.start();for(let i=0;i<120;i++)sim.step(5.8);
    assert.equal(sim.cartonSteeringLimited,true);assert.ok(sim.x<=4);
  }finally{sim.dispose();}
});

test('the opening still offers a gate override so a genuinely lossless delivery is attainable',()=>{
  for(let seed=0;seed<80;seed++){
    const rows=makeSector(seed,0),power=rows.find(row=>row.kind==='power');
    assert.equal(power?.power,'cancel');
    assert.ok(power.at<rows.find(row=>row.kind==='gate'&&row.recipe==='tax').at);
  }
});

test('all fork gates have wide crossings, with no unavoidable tools on either isolated branch',()=>{
  for(let seed=0;seed<50;seed++)for(let sector=4;sector<12;sector++)if(hasFork(seed,sector)){
    const rows=makeSector(seed,sector);
    assert.equal(rows.some(row=>row.kind==='hazard'),false);
    for(const row of rows.filter(row=>row.kind==='gate'))for(let d=0;d<=56;d+=2)assert.equal(forkGap(seed,row.at-d),0,`${row.id}: crossing at ${d}m`);
    assert.ok(roadIntervals(seed,sectorStart(sector)+124).length===2,'the roads still genuinely split');
    assert.equal(forkGap(seed,sectorEnd(sector)-8),0);
  }
});

test('either fork branch can reach the better swapped gate with a 300 ms reaction at maximum speed',()=>{
  for(const from of [-1,1]){
    const sim=new FrySimulation(0),start=sectorStart(4),at=start+192;
    try{
      sim.distance=at-70;sim.generatedSector=6;sim.peak=10n**90n;
      const ops=from<0?[{kind:'add',value:25n},{kind:'subtract',value:10000n}]:[{kind:'subtract',value:10000n},{kind:'add',value:25n}];
      const row={...gate('fork-swap',ops),at,sector:4,swap:true};sim.rows=[row];
      settle(sim,from*2.65);sim.start();
      for(let i=0;i<220&&sim.phase==='running'&&sim.distance<at;i++){
        const reacts=row.swapStartedAt!==undefined&&sim.seconds-row.swapStartedAt>=.8;
        sim.step((reacts?-from:from)*2.65);
      }
      assert.equal(sim.phase,'running');assert.ok(sim.eggs>=10n,'no inevitable death while switching roads');
      assert.equal(sim.selectedSide,from<0?1:0);assert.equal(sim.eggs,35n);
    }finally{sim.dispose();}
  }
});

test('early good choices raise a capped pickup multiplier; waiting, wrong choices and retries do not farm it',()=>{
  const sim=new FrySimulation(0);
  try{
    sim.rows=[];sim.start();for(let i=0;i<180;i++)sim.step(0);
    assert.equal(sim.skillPoints,0);
    const good=gate('good',[{kind:'add',value:12n},{kind:'add',value:5n}]);
    sim.resolve(good);sim.resolve(good);assert.equal(sim.skillPoints,1);
    sim.selectedSide=1;sim.resolve({...good,id:'wrong'});assert.equal(sim.skillPoints,1);
    sim.selectedSide=0;
    for(let i=0;i<3;i++)sim.resolve({...good,id:`good${i}`});
    assert.equal(sim.skillPoints,4);assert.equal(sim.collectionMultiplier,1);
    const pickup={id:'level',kind:'pickup',at:sim.distance+3.2,x:sim.x,count:10n,sector:0};
    sim.rows=[pickup];sim.step(0);
    assert.equal(sim.collectionMultiplier,2);assert.equal(sim.notice.amount,10n,'the level-up pickup uses its displayed amount');
    const next={id:'next',kind:'pickup',at:sim.distance+40,x:0,count:8n,adaptive:true,sector:0};
    sim.rows=[next];sim.step(0);
    assert.equal(next.multiplier,2);assert.equal(next.count,next.baseCount*2n);
    const base=next.baseCount;
    for(let i=0;i<5;i++)sim.resolve({...good,id:`nextLevel${i}`});
    sim.step(0);assert.equal(next.baseCount,base);assert.equal(next.count,base*3n,'visible pickups follow the earned multiplier, not a new clutch reference');
    for(let i=0;i<100;i++)sim.resolve({...good,id:`cap${i}`});
    assert.equal(sim.collectionMultiplier,6);assert.equal(sim.skillPoints,25);
    sim.pause();const snapshot=sim.snapshot();for(let i=0;i<100;i++)sim.step(0);assert.deepEqual(sim.snapshot(),snapshot);
    assert.equal(collectionMultiplier(0),1);
    const retry=new FrySimulation(0);assert.equal(retry.collectionMultiplier,1);retry.dispose();
  }finally{sim.dispose();}
});

test('the same later pickup rewards careful opening choices even after both clutches reach the same size',()=>{
  const amounts=[];
  for(const points of [0,10]){
    const sim=new FrySimulation(0);
    try{
      sim.skillPoints=points;sim.eggs=100n;sim.rows=[{id:'equal',kind:'pickup',at:30,x:0,count:10n,sector:0}];
      sim.start();sim.step(0);amounts.push(sim.rows[0].count);
    }finally{sim.dispose();}
  }
  assert.deepEqual(amounts,[10n,30n]);
});
