import type { Point } from "./types.ts";

export const SWAP_DURATION_MS = 420;

/** Presentation only: gameplay and persistence always use the exact destination slots. */
export function swapFrame(from: readonly Point[], to: readonly Point[], progress: number): Point[] {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return from.map(p => ({ ...p }));
  if (t === 1) return to.map(p => ({ ...p }));
  // A smooth start and landing, with opposite arcs so the two shells remain distinct.
  const eased = t * t * (3 - 2 * t);
  return from.map((a, i) => {
    const b = to[i], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
    if (!distance) return { ...a };
    const bend = Math.min(76, Math.max(48, distance * .16));
    const control = {
      x: Math.max(45, Math.min(955, (a.x + b.x) / 2 - dy / distance * bend * 2)),
      y: Math.max(45, Math.min(955, (a.y + b.y) / 2 + dx / distance * bend * 2)),
    };
    const u = 1 - eased;
    return { x: u * u * a.x + 2 * u * eased * control.x + eased * eased * b.x,
      y: u * u * a.y + 2 * u * eased * control.y + eased * eased * b.y };
  });
}
