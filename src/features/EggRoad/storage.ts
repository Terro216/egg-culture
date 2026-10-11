import { parseRoadCode, roadCode } from "./seed.ts";
import type { RoadVersion } from "./rules.ts";
export const ROAD_STORAGE_KEY = "egg_road_v1";
const PROGRESS_KEY = "egg_road_journey_v1";
export type RoadProgress = { level: number; seed: number; version?: RoadVersion };

export function readRoadProgress(name = activeRoadAccount()): RoadProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(PROGRESS_KEY, name)) ?? "null");
    if (Number.isInteger(saved?.level) && saved.level >= 2 && saved.level <= 1000 && Number.isInteger(saved.seed) && saved.seed >= 0 && saved.seed <= 0xffffffff) return { level: saved.level, seed: saved.seed, ...([2, 3].includes(saved.version) ? { version: saved.version as RoadVersion } : {}) };
  } catch { /* Starting from the tutorial is always possible. */ }
  return { level: 1, seed: 0 };
}

export function saveRoadProgress(progress: RoadProgress, name = activeRoadAccount()) {
  try {
    if (progress.level >= readRoadProgress(name).level) localStorage.setItem(scoreKey(PROGRESS_KEY, name), JSON.stringify(progress));
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
const ACCOUNT_KEY = "egg_road_active_account_v1";
let transientAccount: string | null | undefined;
export function activeRoadAccount(): string | null {
  if (transientAccount !== undefined) return transientAccount;
  try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
}
function scoreKey(key: string, name = activeRoadAccount()) {
  return name ? `${key}:account:${encodeURIComponent(name.normalize("NFKC").toLowerCase())}` : key;
}
export function selectRoadAccount(name: string | null, adoptGuest = false) {
  transientAccount = name ? name.normalize("NFKC").toLowerCase() : null;
  try {
    if (name) {
      const normalized = name.normalize("NFKC").toLowerCase();
      if (adoptGuest) for (const key of [TRACK_SCORES_KEY, SCORES_KEY]) {
        const target = `${key}:account:${encodeURIComponent(normalized)}`;
        const guest = JSON.parse(localStorage.getItem(key) ?? "{}"), previous = JSON.parse(localStorage.getItem(target) ?? "{}");
        for (const [code, value] of Object.entries(guest)) if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) previous[code] = Math.max(previous[code] ?? 0, value);
        localStorage.setItem(target, JSON.stringify(previous));
      }
      localStorage.setItem(ACCOUNT_KEY, normalized);
    } else localStorage.removeItem(ACCOUNT_KEY);
    transientAccount = undefined;
  } catch { /* Account access does not depend on local storage. */ }
}

// Old mode totals cannot identify a seed, so never turn them into map records.
export function readTrackBest(code: string, name = activeRoadAccount()) {
  const spec = parseRoadCode(code);
  if (!spec) return 0;
  try {
    const value = JSON.parse(localStorage.getItem(scoreKey(TRACK_SCORES_KEY, name)) ?? "{}")[roadCode(spec)];
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch { return 0; }
}
export function saveTrackScore(code: string, score: number, name = activeRoadAccount()) {
  const spec = parseRoadCode(code);
  if (!spec || !Number.isSafeInteger(score) || score < 0) return 0;
  const best = Math.max(readTrackBest(code, name), score);
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(TRACK_SCORES_KEY, name)) ?? "{}");
    localStorage.setItem(scoreKey(TRACK_SCORES_KEY, name), JSON.stringify({ ...saved, [roadCode(spec)]: best }));
  } catch { /* The result remains visible in this session. */ }
  return best;
}

export function saveRoadScore(mode: string, score: number, name = activeRoadAccount()) {
  const best = Math.max(readPointsBest(mode, name), Math.floor(score));
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(SCORES_KEY, name)) ?? "{}");
    localStorage.setItem(scoreKey(SCORES_KEY, name), JSON.stringify({ ...saved, [mode]: best }));
  } catch { /* The result remains visible in this session. */ }
  return best;
}
export function readPointsBest(mode?: string, name = activeRoadAccount()) {
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(SCORES_KEY, name)) ?? "{}");
    const values = mode ? [saved?.[mode]] : Object.values(saved ?? {});
    return Math.max(0, ...values.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0).map(Math.floor));
  } catch { return 0; }
}

export function readSavedRoads(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(SAVED_KEY)) ?? localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string" && s.length < 40 && parseRoadCode(s) !== null) : [];
  } catch { return []; }
}
export function saveRoad(code: string) {
  const saved = [code, ...readSavedRoads().filter(s => s !== code)];
  try { localStorage.setItem(scoreKey(SAVED_KEY), JSON.stringify(saved)); return true; } catch { return false; }
}
export function forgetRoad(code: string) {
  try { localStorage.setItem(scoreKey(SAVED_KEY), JSON.stringify(readSavedRoads().filter(s => s !== code))); return true; } catch { return false; }
}
