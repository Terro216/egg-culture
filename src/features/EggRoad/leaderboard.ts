import { parseRoadCode, roadCode } from "./seed.ts";
import { emptyScore } from "./scoring.ts";
import type { ScoreBreakdown } from "./scoring.ts";

export type PublishedRun = {
  code: string; name: string; score: number; gates: number; distance: number;
  seconds: number; finished: boolean; breakdown: ScoreBreakdown;
};
export type LeaderboardEntry = {
  rank: number; name: string; score: number; gates: number; distance: number;
  seconds: number; finished: boolean; mine: boolean;
};
export type RoadLeaderboard = {
  code: string; entries: LeaderboardEntry[]; personal: LeaderboardEntry | null;
  total: number; name: string; endlessBest: number;
};

export function canonicalRoadCode(value: unknown) {
  if (typeof value !== "string" || value.length > 40) return null;
  const spec = parseRoadCode(value);
  return spec ? roadCode(spec) : null;
}

// These are input/sanity limits, not proof of a run: the physics runs in the browser.
export function parsePublishedRun(value: unknown): PublishedRun | null {
  if (!value || typeof value !== "object") return null;
  const run = value as PublishedRun;
  const code = canonicalRoadCode(run.code);
  if (!code || typeof run.name !== "string" || typeof run.finished !== "boolean") return null;
  const name = run.name.normalize("NFC").trim().replace(/ +/g, " ");
  if (!name || [...name].length > 32 || /[<>\p{Cc}\p{Cf}]/u.test(name)) return null;
  if (!Number.isSafeInteger(run.score) || run.score < 1 || run.score > 1e12 ||
      !Number.isSafeInteger(run.gates) || run.gates < 0 || run.gates > 1e8 ||
      !Number.isFinite(run.distance) || run.distance < 0 || run.distance > 2e9 ||
      !Number.isFinite(run.seconds) || run.seconds < 0.1 || run.seconds > 604800) return null;
  if (Math.floor(run.distance / 18) !== run.gates || run.score > run.distance * 100 + 1000 ||
      (code.startsWith("EGG1-E-") && run.finished)) return null;
  const breakdown = emptyScore();
  for (const kind of Object.keys(breakdown) as (keyof ScoreBreakdown)[]) {
    const points = run.breakdown?.[kind];
    if (!Number.isSafeInteger(points) || points < 0) return null;
    breakdown[kind] = points;
  }
  if (breakdown.gates !== run.gates * 100 || Object.values(breakdown).reduce((a, b) => a + b, 0) !== run.score) return null;
  return { code, name, score: run.score, gates: run.gates, distance: run.distance, seconds: run.seconds, finished: run.finished, breakdown };
}
