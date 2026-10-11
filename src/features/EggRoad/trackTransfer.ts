import { Sphere, Vector3 } from "three";
import type { RoadTrack } from "./track.ts";

export function packTrack(track: RoadTrack) {
  const samples = new Float64Array(track.samples.length * 14);
  track.samples.forEach((s, i) => samples.set([...s.position, ...s.tangent, ...s.right, ...s.normal, s.width, s.distance], i * 14));
  return {
    samples, chunks: track.chunks.map(c => ({ ...c, origin: c.origin.toArray() })),
    level: track.level, seed: track.seed, version: track.version, length: track.length, variations: track.variations, loop: track.loop, speedRun: track.speedRun,
    bounds: [...track.bounds.center, track.bounds.radius],
    endless: track.endless ? { nextPart: track.endless.nextPart, revision: track.endless.revision } : undefined,
  };
}
export type PackedTrack = ReturnType<typeof packTrack>;
export function unpackTrack(packed: PackedTrack): RoadTrack {
  const samples: RoadTrack["samples"] = [];
  for (let i = 0; i < packed.samples.length; i += 14) {
    samples.push({ position: new Vector3().fromArray(packed.samples, i), tangent: new Vector3().fromArray(packed.samples, i + 3),
      right: new Vector3().fromArray(packed.samples, i + 6), normal: new Vector3().fromArray(packed.samples, i + 9),
      width: packed.samples[i + 12], distance: packed.samples[i + 13] });
  }
  return { ...packed, samples, chunks: packed.chunks.map(c => ({ ...c, origin: new Vector3().fromArray(c.origin) })),
    bounds: new Sphere(new Vector3().fromArray(packed.bounds), packed.bounds[3]) };
}
