import { MathUtils, Vector3 } from "three";
import { createRoadTrack, roadCollider } from "./track.ts";
import type { RoadTrack } from "./track.ts";

const UP = new Vector3(0, 1, 0);
const partSeed = (seed: number, part: number) => (seed + Math.imul(part, 0x9e3779b9)) >>> 0;

function append(track: RoadTrack) {
  const part = track.endless!.nextPart++;
  const next = createRoadTrack(Math.min(1000, 2 + Math.floor(part / 2)), partSeed(track.seed, part));
  const end = track.samples.at(-1)!;
  const origin = next.samples[0].position.clone();
  const yaw = Math.atan2(-end.tangent.x, -end.tangent.z);
  const distance = end.distance;
  for (const s of next.samples) {
    const blend = MathUtils.smoothstep(s.distance, 0, 45);
    s.width = MathUtils.lerp(end.width, s.width, blend);
    s.position.sub(origin).applyAxisAngle(UP, yaw).add(end.position);
    s.tangent.applyAxisAngle(UP, yaw); s.right.applyAxisAngle(UP, yaw); s.normal.applyAxisAngle(UP, yaw);
    s.distance += distance;
  }
  // Exactly shared seam vertices, including bank and width.
  next.samples[0] = { ...end, position: end.position.clone(), tangent: end.tangent.clone(), right: end.right.clone(), normal: end.normal.clone() };
  const chunk = roadCollider(next.samples);
  chunk.first = track.samples.length - 1;
  chunk.last += chunk.first;
  track.samples.push(...next.samples.slice(1));
  track.chunks.push(chunk);
  track.length = track.samples.at(-1)!.distance;
  track.endless!.revision++;
}

export function createEndlessTrack(seed: number): RoadTrack {
  const track = createRoadTrack(2, seed);
  track.endless = { nextPart: 1, revision: 0 };
  append(track); append(track);
  return track;
}

/** Keep one section behind and two ahead. The physics world follows this same window. */
export function streamEndless(track: RoadTrack, progress: number) {
  if (!track.endless) return 0;
  let current = track.chunks.findIndex(chunk => track.samples[chunk.last].distance > progress);
  if (current < 0) current = track.chunks.length - 1;
  while (track.chunks.length - current < 3) append(track);
  let dropped = 0;
  if (current > 1) {
    const keep = current - 1;
    dropped = track.chunks[keep].first;
    track.chunks.splice(0, keep);
    track.samples.splice(0, dropped);
    for (const chunk of track.chunks) { chunk.first -= dropped; chunk.last -= dropped; }
    track.endless.revision++;
  }
  return dropped;
}

/** Floating origin keeps Rapier's single-precision coordinates small on long runs. */
export function shiftEndless(track: RoadTrack, shift: Vector3) {
  for (const sample of track.samples) sample.position.sub(shift);
  for (const chunk of track.chunks) for (let i = 0; i < chunk.vertices.length; i += 3) {
    chunk.vertices[i] -= shift.x; chunk.vertices[i + 1] -= shift.y; chunk.vertices[i + 2] -= shift.z;
  }
  track.bounds.center.sub(shift);
  track.endless!.revision++;
}
