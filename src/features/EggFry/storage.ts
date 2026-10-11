import { activePortalName, announceAchievements, portalStorageKey } from "../Portal/local.ts";
import type { AchievementId } from "../Portal/model.ts";
export const FRY_STORAGE_KEY = "egg_fry_v3";
export type FryPreferences = { muted: boolean; reducedMotion: boolean };
export type FryProgress = FryPreferences & { best: string; peak: string; longest: number; runs: number; achievements: string[] };
export type FryResult = { eggs: bigint; peak: bigint; seconds: number; sector: number; seed: number; success: boolean; losses: number; jackpot: boolean; dodged?: number; swaps?: number; collectionMultiplier?: number; skillPoints?: number };
const defaults = (): FryProgress => ({ best: "0", peak: "0", longest: 0, runs: 0, achievements: [], muted: true, reducedMotion: false });
const count = (value: unknown) => typeof value === "string" && /^\d{1,512}$/.test(value) ? BigInt(value).toString() : "0";

const achievementKeys = ["one", "thousand", "jackpot", "clean", "million", "dodger", "risk", "switcher"];
export function legacyFryBest(): string {
  try { return count(JSON.parse(localStorage.getItem("egg_fry_v1") ?? "null")?.best); } catch { return "0"; }
}
export function readFryProgress(name = activePortalName()): FryProgress {
  try {
    const data = JSON.parse(localStorage.getItem(portalStorageKey(FRY_STORAGE_KEY, name)) ?? "null");
    if (!data || typeof data !== "object") {
      const legacy = JSON.parse(localStorage.getItem(portalStorageKey("egg_fry_v2", name)) ?? localStorage.getItem("egg_fry_v1") ?? "null");
      return { ...defaults(), muted: legacy?.muted !== false, reducedMotion: legacy?.reducedMotion === true,
        achievements: Array.isArray(legacy?.achievements) ? legacy.achievements.filter((key: unknown) => typeof key === "string" && achievementKeys.includes(key)) : [] };
    }
    return {
      best: count(data.best), peak: count(data.peak),
      longest: Number.isFinite(data.longest) && data.longest >= 0 ? data.longest : 0,
      runs: Number.isSafeInteger(data.runs) && data.runs >= 0 ? data.runs : 0,
      muted: data.muted !== false, reducedMotion: data.reducedMotion === true,
      achievements: Array.isArray(data.achievements) ? data.achievements.filter((v: unknown) => typeof v === "string" && achievementKeys.includes(v)) : [],
    };
  } catch { return defaults(); }
}

function write(progress: FryProgress, name = activePortalName()) {
  try { localStorage.setItem(portalStorageKey(FRY_STORAGE_KEY, name), JSON.stringify(progress)); } catch { /* Optional browser progress. */ }
  return progress;
}
export function saveFryPreferences(preferences: FryPreferences) { return write({ ...readFryProgress(), ...preferences }); }
export function saveFryMilestones(peak: bigint, jackpot: boolean, sector: number, dodged: number, swaps: number, name = activePortalName()) {
  const previous = readFryProgress(name);
  const earned = [...(peak >= 1000000n ? ["million"] : []), ...(jackpot ? ["jackpot"] : []), ...(sector >= 5 ? ["risk"] : []), ...(dodged >= 5 ? ["dodger"] : []), ...(swaps >= 5 ? ["switcher"] : [])];
  const unlocked = earned.filter(key => !previous.achievements.includes(key));
  if (unlocked.length) {
    write({ ...previous, achievements: [...new Set([...previous.achievements, ...earned])] }, name);
    announceAchievements(unlocked.map(key => `fry.${key}` as AchievementId), name);
  }
}
export function saveFryResult(result: FryResult, name = activePortalName()): { progress: FryProgress; newBest: boolean; unlocked: string[] } {
  saveFryMilestones(result.peak, result.jackpot, result.sector, result.dodged ?? 0, result.swaps ?? 0, name);
  const previous = readFryProgress(name);
  const delivered = result.success ? result.eggs : 0n;
  const newBest = delivered > BigInt(previous.best);
  const earned = [
    ...(delivered === 1n ? ["one"] : []), ...(delivered >= 1000n ? ["thousand"] : []),
    ...(result.jackpot ? ["jackpot"] : []), ...(result.success && result.losses === 0 ? ["clean"] : []),
  ];
  const unlocked = earned.filter(key => !previous.achievements.includes(key));
  announceAchievements(unlocked.map(key => `fry.${key}` as AchievementId), name);
  return {
    newBest, unlocked,
    progress: write({ ...previous, best: newBest ? delivered.toString() : previous.best,
      peak: result.peak > BigInt(previous.peak) ? result.peak.toString() : previous.peak,
      longest: Math.max(previous.longest, result.seconds), runs: previous.runs + 1,
      achievements: [...new Set([...previous.achievements, ...earned])],
    }, name),
  };
}
