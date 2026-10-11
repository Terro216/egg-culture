import { MathUtils, Vector3 } from "three";
import type { RoadSample } from "./track.ts";

export type RoadVariation = { kind: "bridge" | "bend"; first: number; last: number };
const UP = new Vector3(0, 1, 0);

/** Distance, including previous endless sections, increases frequency, not severity. */
export const roadVariationChance = (distance: number) => .16 + .56 * (1 - Math.exp(-Math.max(0, distance) / 1600));

/** Called once during generation in the worker; never during a physics frame. */
export function varyStraightRoad(samples: RoadSample[], seed: number, distanceOffset = 0): RoadVariation[] {
  let state = (seed ^ 0x51ed270b) >>> 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 >>> 0; return state / 4294967296; };
  const variations: RoadVariation[] = [];
  const length = samples.at(-1)!.distance;
  for (let first = 1; first < samples.length - 1;) {
    let last = first;
    // Keep features on actual straights, away from the start, turns and finish.
    while (last + 1 < samples.length && samples[last].tangent.dot(samples[last + 1].tangent) > .999998) last++;
    const start = samples[first].distance + 6, end = samples[last].distance - 6;
    if (end - start >= 42 && start > 120 && end < length - 48) {
      const roll = random(), kind = random() < .55 ? "bridge" : "bend";
      const center = (start + end) / 2, span = kind === "bridge" ? 28 : 40;
      const side = random() < .5 ? -1 : 1;
      if (roll < roadVariationChance(distanceOffset + center)) {
        let from = first, to = last;
        while (samples[from].distance < center - span / 2) from++;
        while (samples[to].distance > center + span / 2) to--;
        for (let i = from; i <= to; i++) {
          const s = samples[i], u = (s.distance - (center - span / 2)) / span;
          if (kind === "bridge") {
            // Eight metres of narrow deck with ten-metre tapered approaches.
            const taper = MathUtils.smoothstep(Math.min(u, 1 - u), 0, 10 / span);
            s.width = MathUtils.lerp(s.width, Math.max(5.2, s.width * .64), taper);
          } else {
            // A gentle excursion and return, with zero slope at both ends.
            s.position.addScaledVector(s.right, side * 1.8 * Math.sin(Math.PI * u) ** 2);
          }
        }
        variations.push({ kind, first: from, last: to });
      }
    }
    first = last + 1;
  }
  if (!variations.some(v => v.kind === "bend")) return variations;
  // Rebuild the local frames and real travelled distance after lateral movement.
  // This same geometry supplies the renderer, collider, scoring and landing guide.
  for (let i = 1; i < samples.length; i++) samples[i].distance = samples[i - 1].distance + samples[i].position.distanceTo(samples[i - 1].position);
  for (const variation of variations) if (variation.kind === "bend") {
    for (let i = variation.first - 1; i <= variation.last + 1; i++) {
      const s = samples[i];
      s.tangent.copy(samples[i + 1].position).sub(samples[i - 1].position).normalize();
      s.right.crossVectors(s.tangent, UP).normalize();
      s.normal.crossVectors(s.right, s.tangent).normalize();
    }
  }
  return variations;
}
