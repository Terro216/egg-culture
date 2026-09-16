import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

export const GATE_SPACING = 18;
const UP = new Vector3(0, 1, 0);

export type RoadSample = {
  position: Vector3;
  tangent: Vector3;
  right: Vector3;
  normal: Vector3;
  width: number;
  distance: number;
};

export type RoadChunk = {
  first: number;
  last: number;
  vertices: Float32Array;
  indices: Uint32Array;
};

export type RoadTrack = {
  samples: RoadSample[];
  chunks: RoadChunk[];
  length: number;
};

/** A repeatable, finite test course: a forgiving run-in and four descending coils. */
export function createRoadTrack(): RoadTrack {
  const controls = [
    new Vector3(0, 12, 32),
    new Vector3(0, 10, 16),
    new Vector3(0, 8, 0),
  ];
  const turns = 4;
  for (let i = 1; i <= turns * 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 31 + Math.sin(angle * 0.47) * 5;
    controls.push(new Vector3(
      radius * (1 - Math.cos(angle)),
      8 - angle * 3.4 + Math.sin(angle * 1.5) * 0.8,
      -radius * Math.sin(angle),
    ));
  }
  const end = controls.at(-1)!;
  controls.push(end.clone().add(new Vector3(0, -2, -18)));
  controls.push(end.clone().add(new Vector3(0, -3, -36)));
  const curve = new CatmullRomCurve3(controls, false, "centripetal");
  curve.arcLengthDivisions = 5000;
  const length = curve.getLength();
  const count = Math.ceil(length / 1.05);
  const samples: RoadSample[] = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const tangent = curve.getTangentAt(u).normalize();
    const previous = curve.getTangentAt(Math.max(0, u - 0.004));
    const next = curve.getTangentAt(Math.min(1, u + 0.004));
    const turn = previous.z * next.x - previous.x * next.z;
    const bank = MathUtils.clamp(-turn * 0.9, -0.2, 0.2);
    const right = new Vector3().crossVectors(tangent, UP).normalize().applyAxisAngle(tangent, bank);
    const normal = new Vector3().crossVectors(right, tangent).normalize();
    const distance = u * length;
    const width = distance < 48 ? 10.6 : MathUtils.lerp(10.6, 8.1, Math.min(1, (distance - 48) / 180));
    samples.push({ position: curve.getPointAt(u), tangent, right, normal, width, distance });
  }

  const chunks: RoadChunk[] = [];
  for (let first = 0; first < count; first += 64) {
    const last = Math.min(count, first + 64);
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let i = first; i <= last; i++) {
      const sample = samples[i];
      for (const side of [-1, 1]) {
        const point = sample.position.clone().addScaledVector(sample.right, side * sample.width / 2);
        vertices.push(point.x, point.y, point.z);
      }
      if (i < last) {
        const v = (i - first) * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    chunks.push({ first, last, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) });
  }
  return { samples, chunks, length };
}

export function nearestRoadSample(track: RoadTrack, position: Vector3, first = 0, last = track.samples.length - 1) {
  let closest = first;
  let distance = Infinity;
  for (let i = first; i <= last; i++) {
    const candidate = track.samples[i].position.distanceToSquared(position);
    if (candidate < distance) { distance = candidate; closest = i; }
  }
  return closest;
}
