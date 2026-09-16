export const ROAD_STORAGE_KEY = "egg_road_v1";

export function readRoadBest() {
  try {
    const value = JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "null")?.best;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch { return 0; }
}
