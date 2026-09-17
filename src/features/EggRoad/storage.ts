import { parseRoadCode, roadCode } from "./seed.ts";
export const ROAD_STORAGE_KEY = "egg_road_v1";
const PROGRESS_KEY = "egg_road_journey_v1";
export type RoadProgress = { level: number; seed: number };

export function readRoadProgress(): RoadProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    if (Number.isInteger(saved?.level) && saved.level >= 2 && saved.level <= 1000 && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xffffffff) return { level: saved.level, seed: saved.seed };
  } catch { /* Starting from the tutorial is always possible. */ }
  return { level: 1, seed: 0 };
}

export function saveRoadProgress(progress: RoadProgress) {
  try {
    if (progress.level >= readRoadProgress().level) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* Progress stays in this session when storage is unavailable. */ }
}

export function readRoadBest() {
  try {
    const value = JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "null")?.best;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch { return 0; }
}

const SCORES_KEY = "egg_road_points_v2";
const SAVED_KEY = "egg_road_maps_v1";
const TRACK_SCORES_KEY = "egg_road_track_points_v1";

// Old mode totals cannot identify a seed, so never turn them into map records.
export function readTrackBest(code: string) {
  const spec = parseRoadCode(code);
  if (!spec) return 0;
  try {
    const value = JSON.parse(localStorage.getItem(TRACK_SCORES_KEY) ?? "{}")[roadCode(spec)];
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch { return 0; }
}
export function saveTrackScore(code: string, score: number) {
  const spec = parseRoadCode(code);
  if (!spec || !Number.isSafeInteger(score) || score < 0) return 0;
  const best = Math.max(readTrackBest(code), score);
  try {
    const saved = JSON.parse(localStorage.getItem(TRACK_SCORES_KEY) ?? "{}");
    localStorage.setItem(TRACK_SCORES_KEY, JSON.stringify({ ...saved, [roadCode(spec)]: best }));
  } catch { /* The result remains visible in this session. */ }
  return best;
}

export function saveRoadScore(mode: string, score: number) {
  const best = Math.max(readPointsBest(mode), Math.floor(score));
  try {
    const saved = JSON.parse(localStorage.getItem(SCORES_KEY) ?? "{}");
    localStorage.setItem(SCORES_KEY, JSON.stringify({ ...saved, [mode]: best }));
  } catch { /* The result remains visible in this session. */ }
  return best;
}
export function readPointsBest(mode?: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORES_KEY) ?? "{}");
    const values = mode ? [saved?.[mode]] : Object.values(saved ?? {});
    return Math.max(0, ...values.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0).map(Math.floor));
  } catch { return 0; }
}

export function readSavedRoads(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string" && s.length < 40 && parseRoadCode(s) !== null) : [];
  } catch { return []; }
}
export function saveRoad(code: string) {
  const saved = [code, ...readSavedRoads().filter(s => s !== code)];
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); return true; } catch { return false; }
}
export function forgetRoad(code: string) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(readSavedRoads().filter(s => s !== code))); return true; } catch { return false; }
}
