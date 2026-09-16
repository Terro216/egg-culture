import { Box3, CatmullRomCurve3, MathUtils, Sphere, Vector3 } from "three";

export const GATE_SPACING = 18;
export const ROAD_THICKNESS = 0.4;
const UP = new Vector3(0, 1, 0);

export type RoadSample = { position: Vector3; tangent: Vector3; right: Vector3; normal: Vector3; width: number; distance: number };
export type RoadChunk = { first: number; last: number; vertices: Float32Array; indices: Uint32Array };
export type RoadTrack = {
  samples: RoadSample[]; chunks: RoadChunk[]; length: number;
  level: number; seed: number; bounds: Sphere;
  endless?: { nextPart: number; revision: number };
};

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function tutorialPoints() {
  const points = [new Vector3(0, 12, 32), new Vector3(0, 10, 16), new Vector3(0, 8, 0)];
  for (let i = 1; i <= 4 * 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    const radius = 31 + Math.sin(angle * 0.47) * 5;
    points.push(new Vector3(radius * (1 - Math.cos(angle)), 8 - angle * 3.4 + Math.sin(angle * 1.5) * 0.8, -radius * Math.sin(angle)));
  }
  const end = points.at(-1)!;
  points.push(end.clone().add(new Vector3(0, -2, -18)), end.clone().add(new Vector3(0, -3, -36)));
  return points;
}

function generatedPoints(level: number, seed: number, fallback = false) {
  const random = randomSource(seed);
  const points = [new Vector3(0, 12, 32), new Vector3(0, 10, 16), new Vector3(0, 8, 0)];
  const position = points.at(-1)!.clone();
  let heading = 0;
  const arc = (angle: number, radius: number, slope: number) => {
    const steps = Math.ceil(Math.abs(angle) / 0.12);
    const turn = angle / steps;
    const distance = Math.abs(turn) * radius;
    for (let i = 0; i < steps; i++) {
      heading += turn / 2;
      position.x += Math.sin(heading) * distance;
      position.z -= Math.cos(heading) * distance;
      position.y -= slope * distance;
      heading += turn / 2;
      points.push(position.clone());
    }
  };
  const motifs = 4 + Math.min(3, Math.floor(level / 3));
  const direction = random() > 0.5 ? 1 : -1;
  for (let i = 0; i < motifs; i++) {
    const radius = 32 + random() * 15 - Math.min(5, level * 0.4);
    const slope = 0.12 + random() * 0.045;
    if (fallback || i === 0 || random() < 0.32) {
      arc(direction * Math.PI * 2, radius, slope);
    } else if (random() < 0.5) {
      const bend = Math.PI * (0.55 + random() * 0.3);
      const side = random() > 0.5 ? 1 : -1;
      arc(side * bend, radius, slope);
      arc(-side * bend, radius * (0.95 + random() * 0.3), slope);
    } else {
      arc((random() > 0.5 ? 1 : -1) * Math.PI * (0.8 + random() * 0.8), radius, slope);
    }
  }
  for (let i = 0; i < 3; i++) {
    position.add(new Vector3(Math.sin(heading) * 12, -1.4, -Math.cos(heading) * 12));
    points.push(position.clone());
  }
  return points;
}

function sampleCurve(points: Vector3[], level: number): RoadSample[] {
  const curve = new CatmullRomCurve3(points, false, "centripetal");
  curve.arcLengthDivisions = 6000;
  const length = curve.getLength();
  const count = Math.ceil(length / 1.05);
  const samples: RoadSample[] = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const tangent = curve.getTangentAt(u).normalize();
    const previous = curve.getTangentAt(Math.max(0, u - 0.004));
    const next = curve.getTangentAt(Math.min(1, u + 0.004));
    const bank = MathUtils.clamp(-(previous.z * next.x - previous.x * next.z) * 0.9, -0.2, 0.2);
    const right = new Vector3().crossVectors(tangent, UP).normalize().applyAxisAngle(tangent, bank);
    const normal = new Vector3().crossVectors(right, tangent).normalize();
    const distance = u * length;
    const targetWidth = level === 1 ? 8.1 : Math.max(7.3, 9.5 - level * 0.24);
    const width = distance < 48 ? 10.6 : MathUtils.lerp(10.6, targetWidth, Math.min(1, (distance - 48) / 180));
    samples.push({ position: curve.getPointAt(u), tangent, right, normal, width, distance });
  }
  return samples;
}

/** Reject crossings whose road decks would touch or leave no room for an egg. */
export function hasRoadClearance(samples: RoadSample[]) {
  for (let a = 0; a < samples.length; a += 4) {
    for (let b = a + 36; b < samples.length; b += 4) {
      const x = samples[a], y = samples[b];
      if (Math.abs(x.position.y - y.position.y) >= 8) continue;
      const clearance = (x.width + y.width) / 2 + 1;
      if (Math.hypot(x.position.x - y.position.x, x.position.z - y.position.z) < clearance) return false;
    }
  }
  return true;
}

/** One continuous, closed road shell: top, bottom, both edges and end caps. */
export function roadCollider(samples: RoadSample[]): RoadChunk {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const left = s.position.clone().addScaledVector(s.right, -s.width / 2);
    const right = s.position.clone().addScaledVector(s.right, s.width / 2);
    for (const p of [left, right, left.clone().addScaledVector(s.normal, -ROAD_THICKNESS), right.clone().addScaledVector(s.normal, -ROAD_THICKNESS)]) vertices.push(p.x, p.y, p.z);
    if (i === samples.length - 1) continue;
    const v = i * 4;
    indices.push(v, v+1, v+4, v+1, v+5, v+4);
    indices.push(v+2, v+6, v+3, v+3, v+6, v+7);
    indices.push(v, v+4, v+2, v+2, v+4, v+6);
    indices.push(v+1, v+3, v+5, v+3, v+7, v+5);
  }
  indices.push(0, 2, 1, 1, 2, 3);
  const end = (samples.length - 1) * 4;
  indices.push(end, end+1, end+2, end+1, end+3, end+2);
  return { first: 0, last: samples.length - 1, vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Level one stays familiar. Later levels are reproducible from their saved seed. */
export function createRoadTrack(level = 1, seed = 0): RoadTrack {
  level = Math.max(1, Math.min(1000, Math.floor(level) || 1));
  seed >>>= 0;
  let samples = sampleCurve(tutorialPoints(), 1);
  if (level > 1) {
    for (let attempt = 0; attempt < 14; attempt++) {
      samples = sampleCurve(generatedPoints(level, seed + Math.imul(attempt, 0x9e3779b9), attempt >= 10), level);
      if (hasRoadClearance(samples)) break;
      if (attempt === 13) throw new Error("Could not generate a road with safe crossings");
    }
  }
  const bounds = new Box3().setFromPoints(samples.map(s => s.position)).expandByScalar(6).getBoundingSphere(new Sphere());
  return { samples, chunks: [roadCollider(samples)], length: samples.at(-1)!.distance, level, seed, bounds };
}

export function nearestRoadSample(track: RoadTrack, position: Vector3, first = 0, last = track.samples.length - 1) {
  let closest = first, distance = Infinity;
  for (let i = first; i <= last; i++) {
    const candidate = track.samples[i].position.distanceToSquared(position);
    if (candidate < distance) { distance = candidate; closest = i; }
  }
  return closest;
}
