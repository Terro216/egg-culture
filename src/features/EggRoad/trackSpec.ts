import { createRoadTrack } from "./track.ts";
import { createEndlessTrack } from "./endless.ts";
import { createStraightTrack } from "./straight.ts";
import { createStuntTrack } from "./stunts.ts";
import type { RoadSpec } from "./seed.ts";

/** Shared dispatch for the worker, its fallback, simulation and server validation. */
export function createTrackForSpec(spec: RoadSpec, distanceOffset = 0) {
  if (spec.mode === "straight") return createStraightTrack();
  if (spec.mode === "stunt") return createStuntTrack(spec.seed);
  if (spec.mode === "endless") return createEndlessTrack(spec.seed, spec.version);
  return createRoadTrack(spec.level, spec.seed, spec.version, distanceOffset);
}
