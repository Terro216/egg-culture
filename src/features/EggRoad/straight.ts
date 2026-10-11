import { Box3, Sphere, Vector3 } from "three";
import { STRAIGHT_ROAD } from "./seed.ts";
import { roadCollider } from "./track.ts";
import type { RoadSample, RoadTrack } from "./track.ts";

/** Five kilometres of constant slope: ordinary physics, no turns or narrowing. */
export function createStraightTrack(): RoadTrack {
  const length = 5000;
  const tangent = new Vector3(0, -.125, -1).normalize();
  const right = new Vector3(1, 0, 0);
  const normal = new Vector3().crossVectors(right, tangent).normalize();
  const start = new Vector3(0, 12, 32);
  const samples: RoadSample[] = Array.from({ length: length + 1 }, (_, distance) => ({
    position: start.clone().addScaledVector(tangent, distance),
    tangent: tangent.clone(), right: right.clone(), normal: normal.clone(), width: 10.6, distance,
  }));
  const bounds = new Box3().setFromPoints([start, samples.at(-1)!.position]).expandByScalar(6).getBoundingSphere(new Sphere());
  return { samples, chunks: [roadCollider(samples)], length, level: STRAIGHT_ROAD.level, seed: STRAIGHT_ROAD.seed, version: STRAIGHT_ROAD.version, bounds };
}
