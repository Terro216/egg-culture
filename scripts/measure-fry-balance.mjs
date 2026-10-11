// Deterministic local simulation only: no browser, account, API or production writes.
import { initializeFryPhysics } from '../src/features/EggFry/physics.ts';
import { FrySimulation } from '../src/features/EggFry/simulation.ts';
import { pilotTarget } from './lib/fry-pilot.mjs';
await initializeFryPhysics();
const runs=Math.max(4,Math.min(32,Number(process.env.FRY_BENCH_SEEDS)||12));
for(const [mode,bankAt] of [['first',1],['six',6],['idle',Infinity]]){
  const results=[];
  for(let seed=1;seed<=runs;seed++){
    const sim=new FrySimulation(seed),state={reaction:.3};
    try{
      sim.start();
      for(let step=0;step<18000&&sim.phase==='running';step++)sim.step(mode==='idle'?2.65:pilotTarget(sim,state,bankAt));
      results.push({seed,success:sim.result?.success??false,eggs:sim.result?.eggs.toString()??'0',peak:sim.peak.toString(),section:sim.snapshot().sector+1,seconds:Math.round(sim.seconds),multiplier:sim.collectionMultiplier});
    }finally{sim.dispose();}
  }
  const scores=results.filter(r=>r.success).map(r=>BigInt(r.eggs)).sort((a,b)=>a<b?-1:a>b?1:0);
  console.log(JSON.stringify({mode,runs,delivered:scores.length,median:scores.length?scores[Math.floor(scores.length/2)].toString():null,results}));
}
