import { RoadSimulation } from "./simulation.ts";
import { createTrackForSpec } from "./trackSpec.ts";
import { newRoadSeed } from "./seed.ts";
import type { RoadSpec } from "./seed.ts";
import type { RoadProgress } from "./storage.ts";
import type { RoadTrack } from "./track.ts";
export { newRoadSeed } from "./seed.ts";

export class RoadJourney {
  simulation: RoadSimulation;
  private next: RoadProgress | null = null;
  constructor(progress: RoadProgress & { mode?: RoadSpec["mode"] } = { level: 1, seed: 0 }, track?: RoadTrack) {
    this.simulation = new RoadSimulation(track ?? createTrackForSpec({ ...progress, mode: progress.mode ?? "levels" }), progress.mode ?? "levels");
  }
  checkpoint(): RoadProgress | null {
    if (this.simulation.phase !== "finished" || this.simulation.mode !== "levels") return null;
    this.next ??= { level: Math.min(1000, this.simulation.track.level + 1), seed: newRoadSeed(), ...(this.simulation.track.version > 1 ? { version: this.simulation.track.version } : {}) };
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
    if (sim.track.endless) this.select({ mode: "endless", level: 2, seed: sim.track.seed, version: sim.track.version });
    else sim.reset();
  }
  select(spec: RoadSpec, prepared?: RoadTrack) {
    const track = prepared ?? createTrackForSpec(spec);
    const next = new RoadSimulation(track, spec.mode);
    this.simulation.dispose(); this.simulation = next; this.next = null;
  }
  dispose() { this.simulation.dispose(); }
}
