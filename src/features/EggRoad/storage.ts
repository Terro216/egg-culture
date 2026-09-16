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
