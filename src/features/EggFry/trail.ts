import { clampSteering } from "./rules.ts";

/** Distance-based history: a pause or a speed change cannot stretch the procession. */
export class FryTrail {
  private points: { at: number; x: number }[] = [{ at: 0, x: 0 }];
  private distance = 0;
  push(distance: number, x: number) {
    this.distance = distance;
    const point = { at: distance, x: clampSteering(x) };
    const last = this.points.at(-1)!;
    if (distance > last.at) this.points.push(point);
    else this.points[this.points.length - 1] = point;
    while (this.points.length > 2 && this.points[1].at < distance - 80) this.points.shift();
  }
  at(behind: number) {
    const target = this.distance - Math.max(0, behind);
    if (target <= this.points[0].at) return this.points[0].x;
    let low = 0, high = this.points.length - 1;
    while (high - low > 1) { const mid = (low + high) >>> 1; if (this.points[mid].at <= target) low = mid; else high = mid; }
    const a = this.points[low], b = this.points[high];
    const t = Math.max(0, Math.min(1, (target - a.at) / Math.max(0.001, b.at - a.at)));
    return a.x + (b.x - a.x) * t;
  }
  get size() { return this.points.length; }
}
