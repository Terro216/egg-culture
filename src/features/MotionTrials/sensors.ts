import type { TrialVector } from "./chalaza.ts";

export type TrialOrientation = { alpha: number; beta: number; gamma: number; angle: number };
export const emptyOrientation: TrialOrientation = { alpha: 0, beta: 0, gamma: 0, angle: 0 };
const wrap = (value: number) => ((value + 540) % 360) - 180;

/** Device axes rotate with the screen; each orientation gets its own neutral pose. */
export function chalazaTilt(current: TrialOrientation, baseline: TrialOrientation): TrialVector {
  if (current.angle !== baseline.angle) return { x: 0, y: 0 };
  const beta = wrap(current.beta - baseline.beta), gamma = wrap(current.gamma - baseline.gamma);
  const radians = current.angle * Math.PI / 180;
  return {
    x: -(gamma * Math.cos(radians) + beta * Math.sin(radians)) / 40,
    y: -(beta * Math.cos(radians) - gamma * Math.sin(radians)) / 40,
  };
}

export function trialOrientation(event: { alpha: number | null; beta: number | null; gamma: number | null }, angle: number): TrialOrientation | null {
  if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  return { alpha: Number.isFinite(event.alpha) ? event.alpha! : 0, beta: event.beta, gamma: event.gamma, angle: Number.isFinite(angle) ? angle : 0 };
}

/** Every successful path uses the same integer score contract as the profile. */
export function oracleSensorScore(peaks: readonly number[]): number | null {
  if (peaks.length !== 3 || peaks.some(value => !Number.isFinite(value) || value < 16 || value > 30)) return null;
  const average = peaks.reduce((sum, value) => sum + value, 0) / peaks.length;
  return average >= 24 ? Math.round(Math.max(82, Math.min(100, 100 - Math.abs(average - 27) * 4))) : null;
}
