import { RoadSimulation } from "./simulation.ts";
import { createRoadTrack } from "./track.ts";
import type { RoadProgress } from "./storage.ts";

export function newRoadSeed() {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

export class RoadJourney {
  simulation: RoadSimulation;
  private next: RoadProgress | null = null;

  constructor(progress: RoadProgress = { level: 1, seed: 0 }) {
    this.simulation = new RoadSimulation(createRoadTrack(progress.level, progress.seed));
  }

  checkpoint(): RoadProgress | null {
    if (this.simulation.phase !== "finished") return null;
    this.next ??= { level: Math.min(1000, this.simulation.track.level + 1), seed: newRoadSeed() };
    return this.next;
  }

  advance() {
    const progress = this.checkpoint();
    if (!progress) return false;
    this.replace(progress);
    return true;
  }

  practice() { this.replace({ level: 1, seed: 0 }); }

  private replace(progress: RoadProgress) {
    const next = new RoadSimulation(createRoadTrack(progress.level, progress.seed));
    this.simulation.dispose();
    this.simulation = next;
    this.next = null;
  }

  dispose() { this.simulation.dispose(); }
}
