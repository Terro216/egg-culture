import { ROAD_STORAGE_KEY } from "./storage.ts";
export type RoadPreferences = { muted: boolean; landingGuide: boolean; haptics: boolean; quality: "auto" | "low" | "high"; leftHanded: boolean; ghost: boolean };
export const defaultRoadPreferences: RoadPreferences = { muted: true, landingGuide: false, haptics: false, quality: "auto", leftHanded: false, ghost: false };
export function readRoadPreferences(): RoadPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "{}");
    return { muted: saved.muted !== false, landingGuide: saved.landingGuide === true, haptics: saved.haptics === true,
      quality: saved.quality === "low" || saved.quality === "high" ? saved.quality : "auto", leftHanded: saved.leftHanded === true, ghost: saved.ghost === true };
  } catch { return { ...defaultRoadPreferences }; }
}
export function saveRoadPreferences(preferences: RoadPreferences) {
  try { localStorage.setItem(ROAD_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "{}"), ...preferences })); } catch { /* Session settings still work. */ }
}
