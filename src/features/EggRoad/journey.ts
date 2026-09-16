import { RoadSimulation } from "./simulation.ts";
import { createRoadTrack } from "./track.ts";
import { createEndlessTrack } from "./endless.ts";
import { newRoadSeed } from "./seed.ts";
import type { RoadSpec } from "./seed.ts";
import type { RoadProgress } from "./storage.ts";
export { newRoadSeed } from "./seed.ts";

export class RoadJourney {
  simulation: RoadSimulation;
  private next: RoadProgress | null = null;
  constructor(progress: RoadProgress = { level: 1, seed: 0 }) {
    this.simulation = new RoadSimulation(createRoadTrack(progress.level, progress.seed), "levels");
  }
  checkpoint(): RoadProgress | null {
    if (this.simulation.phase !== "finished" || this.simulation.mode !== "levels") return null;
    this.next ??= { level: Math.min(1000, this.simulation.track.level + 1), seed: newRoadSeed() };
    return this.next;
  }
  advance() {
    const progress = this.checkpoint();
    if (!progress) return false;
    this.select({ ...progress, mode: "levels" }); return true;
  }
  practice() { this.select({ mode: "practice", level: 1, seed: 0 }); }
  retry() {
    const sim = this.simulation;
    if (sim.track.endless) this.select({ mode: "endless", level: 2, seed: sim.track.seed });
    else sim.reset();
  }
  select(spec: RoadSpec) {
    const track = spec.mode === "endless" ? createEndlessTrack(spec.seed) : createRoadTrack(spec.level, spec.seed);
    const next = new RoadSimulation(track, spec.mode);
    this.simulation.dispose(); this.simulation = next; this.next = null;
  }
  dispose() { this.simulation.dispose(); }
}
