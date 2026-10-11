import { Sphere, Vector3 } from "three";
import type { RoadChunk, RoadTrack } from "./track.ts";

export type RoadFinish = { chunk: RoadChunk; center: Vector3; right: Vector3; normal: Vector3; tangent: Vector3 };
const platforms = new WeakMap<RoadTrack, RoadFinish>();
export const FINISH_HALF_WIDTH = 7;
export const FINISH_HALF_LENGTH = 10;
export const FINISH_OFFSET = 8;

/** A small, shallow saucer gives a little room beyond the final road tile.
 * It does not extend the scored distance or alter a seed's original road. */
export function roadFinish(track: RoadTrack): RoadFinish | null {
  if (track.endless) return null;
  const cached = platforms.get(track); if (cached) return cached;
  const end = track.samples.at(-1)!;
  const center = end.position.clone().addScaledVector(end.tangent, FINISH_OFFSET);
  const vertices: number[] = [], indices: number[] = [];
  const segments = 64, rings = [0, .65, .92, 1];
  for (const ring of rings) for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const x = Math.cos(angle) * FINISH_HALF_WIDTH * ring, z = Math.sin(angle) * FINISH_HALF_LENGTH * ring;
    // Leave the entrance flush with the road, without a lip to jump over.
    const entrance = z < -4 && Math.abs(x) < end.width * .6;
    const height = entrance ? -.06 : ring < .9 ? -.06 : ring < 1 ? .12 : .55;
    vertices.push(...center.clone().addScaledVector(end.right, x).addScaledVector(end.tangent, z).addScaledVector(end.normal, height));
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < segments; i++) {
    const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
    indices.push(a, a + segments, b, b, a + segments, b + segments);
  }
  // Closed underside and rim, so approaching the dish from below is a collision
  // rather than a false successful landing.
  const bottom = vertices.length / 3;
  vertices.push(...center.clone().addScaledVector(end.normal, -.65));
  for (let i = 0; i < segments; i++) {
    const point = new Vector3().fromArray(vertices, ((rings.length - 1) * segments + i) * 3);
    point.addScaledVector(end.normal, -1.2); vertices.push(...point);
  }
  for (let i = 0; i < segments; i++) {
    const a = (rings.length - 1) * segments + i, b = (rings.length - 1) * segments + (i + 1) % segments;
    const c = bottom + 1 + i, d = bottom + 1 + (i + 1) % segments;
    indices.push(a, c, b, b, c, d, bottom, d, c);
  }
  const chunk: RoadChunk = { first: Math.max(0, track.samples.length - 36), last: track.samples.length - 1,
    vertices: new Float32Array(vertices), indices: new Uint32Array(indices), origin: new Vector3(), finish: true };
  const finish = { chunk, center, right: end.right, normal: end.normal, tangent: end.tangent };
  track.bounds.union(new Sphere(center, FINISH_HALF_LENGTH + 1));
  platforms.set(track, finish);
  return finish;
}
