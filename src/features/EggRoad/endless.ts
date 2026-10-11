import { Box3, MathUtils, Vector3 } from "three";
import { createRoadTrack, roadCollider } from "./track.ts";
import type { RoadSample, RoadTrack } from "./track.ts";
import type { RoadVersion } from "./rules.ts";

const UP = new Vector3(0, 1, 0);
export const partSeed = (seed: number, part: number) => (seed + Math.imul(part, 0x9e3779b9)) >>> 0;
export const partLevel = (part: number) => Math.min(1000, 2 + Math.floor(part / 2));
export function updateRoadBounds(track: RoadTrack) {
  const box = new Box3();
  for (const sample of track.samples) box.expandByPoint(sample.position);
  box.expandByScalar(6).getBoundingSphere(track.bounds);
}

export function joinRoadPart(next: RoadTrack, end: RoadSample) {
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
  next.samples[0] = { ...end, position: new Vector3().copy(end.position), tangent: new Vector3().copy(end.tangent), right: new Vector3().copy(end.right), normal: new Vector3().copy(end.normal) };
  next.chunks = [roadCollider(next.samples)]; next.length = next.samples.at(-1)!.distance;
  return next;
}

function append(track: RoadTrack) {
  const part = track.endless!.nextPart++;
  const prepared = track.endless!.prepared;
  const ready = prepared?.part === part ? prepared : undefined;
  const end = track.samples.at(-1)!;
  const next = ready?.track ?? createRoadTrack(partLevel(part), partSeed(track.seed, part), track.version, end.distance);
  delete track.endless!.prepared;
  if (ready?.fitted) {
    // The origin may have moved while the worker was building this part.
    const delta = end.position.clone().sub(next.samples[0].position);
    if (delta.lengthSq()) {
      for (const sample of next.samples) sample.position.add(delta);
      for (const chunk of next.chunks) chunk.origin.add(delta);
    }
  } else joinRoadPart(next, end);
  const chunk = next.chunks[0];
  chunk.first = track.samples.length - 1;
  chunk.last += chunk.first;
  if (next.variations) (track.variations ??= []).push(...next.variations.map(v => ({ ...v, first: v.first + chunk.first, last: v.last + chunk.first })));
  track.samples.push(...next.samples.slice(1));
  track.chunks.push(chunk);
  track.length = track.samples.at(-1)!.distance;
  track.endless!.revision++;
}

export function createEndlessTrack(seed: number, version: RoadVersion = 1): RoadTrack {
  const track = createRoadTrack(2, seed, version);
  track.endless = { nextPart: 1, revision: 0 };
  append(track); append(track);
  updateRoadBounds(track);
  return track;
}

/** Keep one section behind and two ahead. The physics world follows this same window. */
export function streamEndless(track: RoadTrack, progress: number) {
  if (!track.endless) return 0;
  const revision = track.endless.revision;
  let current = track.chunks.findIndex(chunk => track.samples[chunk.last].distance > progress);
  if (current < 0) current = track.chunks.length - 1;
  while (track.chunks.length - current < 3) append(track);
  let dropped = 0;
  if (current > 1) {
    const keep = current - 1;
    dropped = track.chunks[keep].first;
    track.chunks.splice(0, keep);
    track.samples.splice(0, dropped);
    if (track.variations) track.variations = track.variations.filter(v => v.last >= dropped).map(v => ({ ...v, first: Math.max(0, v.first - dropped), last: v.last - dropped }));
    for (const chunk of track.chunks) { chunk.first -= dropped; chunk.last -= dropped; }
    track.endless.revision++;
  }
  if (revision !== track.endless.revision) updateRoadBounds(track);
  return dropped;
}

/** Floating origin keeps Rapier's single-precision coordinates small on long runs. */
export function shiftEndless(track: RoadTrack, shift: Vector3) {
  for (const sample of track.samples) sample.position.sub(shift);
  // Geometry stays in each chunk's local coordinates. Both GPU objects and
  // Rapier colliders move by translation, preserving their expensive meshes.
  for (const chunk of track.chunks) chunk.origin.sub(shift);
  track.bounds.center.sub(shift);
  track.endless!.revision++;
}
