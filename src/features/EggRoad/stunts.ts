import { Box3, MathUtils, Sphere, Vector3 } from "three";
import { roadCollider } from "./track.ts";
import type { RoadSample, RoadTrack } from "./track.ts";

const UP = new Vector3(0, 1, 0), RIGHT = new Vector3(1, 0, 0);
const smooth = (x: number) => MathUtils.smoothstep(x, 0, 1);

/** Each piece owns a collider: an intentional gap never gets an invisible bridge. */
export function createStuntTrack(seed: number): RoadTrack {
  const samples: RoadSample[] = [], chunks: RoadTrack["chunks"] = [];
  const piece = (path: (t: number) => Vector3, count: number, width: (t: number) => number = () => 10.6, vertical = false) => {
    const first = samples.length;
    for (let i = 0; i <= count; i++) {
      const t = i / count, position = path(t);
      const tangent = path(Math.min(1, t + .00001)).sub(path(Math.max(0, t - .00001))).normalize();
      const right = vertical ? RIGHT.clone().addScaledVector(tangent, -tangent.x).normalize() : new Vector3().crossVectors(tangent, UP).normalize();
      const previous = samples.at(-1);
      samples.push({ position, tangent, right, normal: new Vector3().crossVectors(right, tangent).normalize(), width: width(t),
        distance: previous ? previous.distance + position.distanceTo(previous.position) : 0 });
    }
    const last = samples.length - 1, chunk = roadCollider(samples.slice(first));
    chunks.push({ ...chunk, first, last });
    return { first, last };
  };
  let loop: RoadTrack["loop"];
  if (seed === 1) {
    piece(t => new Vector3(0, 120 - 27.5 * t, 32 - 220 * t), 220, () => 14);
    // Three visible landing decks form one descending switchback. Landing on
    // a lower deck is a real shortcut with the ordinary flight allowance.
    piece(t => new Vector3(-20, 64.5 - 14 * t, -213 - 350 * t), 350, () => 12);
    piece(t => new Vector3(-10 - 10 * Math.cos(t * Math.PI), 50.5 - 16 * smooth(t), -563 - 10 * Math.sin(t * Math.PI)), 90, () => 10);
    piece(t => new Vector3(0, 34.5 - 14 * t, -563 + 350 * t), 350, () => 12);
    piece(t => new Vector3(10 - 10 * Math.cos(t * Math.PI), 20.5 - 16 * smooth(t), -213 + 10 * Math.sin(t * Math.PI)), 90, () => 10);
    piece(t => new Vector3(20, 4.5 - 26 * t, -213 - 650 * t), 650, () => 12);
    chunks[1].color = 0x9a794e; chunks[3].color = 0x71658d; chunks[5].color = 0x537c70;
  } else if (seed === 2) {
    piece(t => { const d = t * 230, q = Math.max(0, d - 190); return new Vector3(0, 12 - .125 * (Math.min(d, 190) + q - q * q / 80), 32 - d); }, 460);
    const base = samples.at(-1)!.position.clone();
    loop = piece(t => new Vector3(18 * smooth(t), 10 * (1 - Math.cos(t * Math.PI * 2)), -10 * Math.sin(t * Math.PI * 2)).add(base), 480, () => 8.5, true);
    const end = samples.at(-1)!.position.clone();
    piece(t => new Vector3(0, -45 * t * smooth(t * 10), -400 * t).add(end), 400);
  } else if (seed === 3) {
    piece(t => { const d = t * 900, envelope = smooth(d / 90) * smooth((900 - d) / 90); return new Vector3((4 + t * 10) * envelope * Math.sin(d * Math.PI * 2 / 145), 12 - d * .125, 32 - d); }, 1000);
  } else if (seed === 4) {
    piece(t => new Vector3(0, 12 - t * 100, 32 - t * 800), 800, t => {
      const d = t * 800;
      let width = 10.6;
      for (const center of [160, 320, 480, 640]) width = Math.min(width, MathUtils.lerp(4.8, 10.6, smooth((Math.abs(d - center) - 12) / 20)));
      return width;
    });
  } else if (seed === 5) {
    // Integrating the angle gives a smooth plunge and a long uphill run-out.
    // All acceleration comes from the ordinary gravity/contact simulation.
    const points = [new Vector3(0, 12, 32)];
    for (let d = 1; d <= 2800; d++) {
      const angle = d < 520 ? MathUtils.lerp(-Math.atan(.125), -.6, smooth((d - 120) / 400))
        : d < 1300 ? -.6 : d < 1950 ? MathUtils.lerp(-.6, .18, smooth((d - 1300) / 650))
        : d < 2350 ? .18 : MathUtils.lerp(.18, -.06, smooth((d - 2350) / 200));
      points.push(points.at(-1)!.clone().add(new Vector3(0, Math.sin(angle), -Math.cos(angle))));
    }
    piece(t => { const i = t * 2800, first = Math.floor(i); return points[first].clone().lerp(points[Math.min(2800, first + 1)], i - first); }, 2800, () => 12);
  } else throw new Error("Unknown stunt road");
  const bounds = new Box3().setFromPoints(samples.map(s => s.position)).expandByScalar(8).getBoundingSphere(new Sphere());
  return { samples, chunks, length: samples.at(-1)!.distance, level: 8, seed, version: 3, bounds, ...(loop ? { loop } : {}), ...(seed === 5 ? { speedRun: true } : {}) };
}
