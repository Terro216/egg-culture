// Offline simulation only. Bots expose regressions and coefficient effects;
// they do not substitute for human difficulty or retention measurements.
import { Vector3 } from 'three';
import { createRoadTrack, nearestRoadSample } from '../src/features/EggRoad/track.ts';
import { initializePhysics, RoadSimulation } from '../src/features/EggRoad/simulation.ts';
import { RoadScoring } from '../src/features/EggRoad/scoring.ts';
import { SteeringRamp } from '../src/features/EggRoad/controls.ts';

await initializePhysics();
const rows = [];
for (const level of [1, 2, 5]) for (let seed = 0; seed < (level === 1 ? 1 : 8); seed++) for (const strategy of ['centre', 'rhythm', 'edge', 'shortcut']) {
  const sim = new RoadSimulation(createRoadTrack(level, seed, 2)), ramp = new SteeringRamp();
  const previous = new RoadScoring(1), current = new RoadScoring(2);
  const scoreContact = sim.scoring.contact.bind(sim.scoring);
  sim.scoring.contact = contact => { previous.contact(contact); current.contact(contact); scoreContact(contact); };
  let target = .65, input = 0, nextShortcut = 130;
  try {
    sim.start();
    for (let step = 0; step < 120 * 60 && sim.phase === 'running'; step++) {
      const index = nearestRoadSample(sim.track, sim.position, Math.max(0, sim.sampleIndex - 12), Math.min(sim.track.samples.length - 1, sim.sampleIndex + 96));
      const sample = sim.track.samples[index];
      const velocity = new Vector3().copy(sim.body.linvel()), lateral = velocity.dot(sample.right);
      const offset = sim.position.clone().sub(sample.position).dot(sample.right);
      if ((target > 0 && offset > target) || (target < 0 && offset < target)) target = -target;
      if (step % 6 === 0) {
        const desired = strategy === 'rhythm' ? target : strategy === 'edge' ? sample.width / 2 - 1.1 : 0;
        const correction = desired - offset - lateral * .25;
        input = Math.abs(correction) < .15 ? 0 : Math.sign(correction);
        if (strategy === 'shortcut' && sim.progress > nextShortcut) {
          if (sim.rollingOnRoad) input = -1;
          else {
            let best = null, error = Infinity;
            for (let i = sim.sampleIndex + 24; i < Math.min(sim.track.samples.length, sim.sampleIndex + 450); i += 6) {
              const candidate = sim.track.samples[i], height = sim.position.y - candidate.position.y;
              if (height < 3 || height > 70) continue;
              const time = (velocity.y + Math.sqrt(velocity.y ** 2 + 40 * height)) / 20;
              const predicted = sim.position.clone().addScaledVector(velocity, time);
              const miss = Math.hypot(predicted.x - candidate.position.x, predicted.z - candidate.position.z);
              if (miss < error) { best = candidate; error = miss; }
            }
            if (best) input = Math.max(-1, Math.min(1, best.position.clone().sub(sim.position).dot(sim.steeringRight) * .2));
          }
          if (sim.lastSkip) nextShortcut = sim.progress + 150;
        }
      }
      if (sim.flightTime > 3.5 && sim.jumpAvailable) sim.jump();
      sim.step(ramp.step(1 / 120, input));
    }
    rows.push({ level, seed, strategy, phase: sim.phase, seconds: sim.seconds, distance: sim.progress, skipped: sim.skipped,
      previous: previous.total, current: current.total, breakdown: current.breakdown() });
  } finally { sim.dispose(); }
}
const summary = ['centre', 'rhythm', 'edge', 'shortcut'].map(strategy => {
  const runs = rows.filter(row => row.strategy === strategy), mean = key => runs.reduce((sum, row) => sum + row[key], 0) / runs.length;
  return { strategy, runs: runs.length, finishes: runs.filter(row => row.phase === 'finished').length,
    seconds: mean('seconds'), distance: mean('distance'), skipped: mean('skipped'), previous: mean('previous'), current: mean('current') };
});
console.log(JSON.stringify({ note: 'Identical physical contacts scored with both rules; deterministic bots, not human playtests.', summary, rows }, null, 2));
