import { ROAD_RULES_VERSION } from "./rules.ts";
import type { RoadVersion } from "./rules.ts";
export type RoadMode = "practice" | "levels" | "endless" | "seed" | "straight" | "stunt";
export type RoadSpec = { mode: RoadMode; level: number; seed: number; version?: RoadVersion };
// A fixed test road. A separate kind preserves every existing R/E seed.
export const STRAIGHT_ROAD = { mode: "straight", level: 8, seed: 0, version: 3 } as const;

export function newRoadSeed() { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }

// Keep this version stable: it identifies the generation rules as well as the random seed.
export function roadCode(spec: RoadSpec) {
  return `EGG${spec.version ?? 1}-${spec.mode === "stunt" ? "T" : spec.mode === "straight" ? "S" : spec.mode === "endless" ? "E" : "R"}-${spec.level}-${(spec.level === 1 && spec.mode !== "endless" ? 0 : spec.seed).toString(36).toUpperCase()}`;
}

export function parseRoadCode(input: string): RoadSpec | null {
  let value = input.trim();
  if (value.length > 2048) return null;
  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).searchParams.get("road") ?? ""; } catch { return null; }
  }
  const match = /^EGG([123])-([REST])-(\d{1,4})-([0-9A-Z]{1,7})$/i.exec(value);
  if (!match) return null;
  const level = Number(match[3]), seed = parseInt(match[4], 36);
  if (match[2].toUpperCase() === "T") return match[1] === "3" && level === 8 && seed >= 1 && seed <= 5 ? { mode: "stunt", version: 3, level, seed } : null;
  if (match[2].toUpperCase() === "S") return Number(match[1]) === STRAIGHT_ROAD.version && level === STRAIGHT_ROAD.level && seed === STRAIGHT_ROAD.seed ? { ...STRAIGHT_ROAD } : null;
  if (level < 1 || level > 1000 || seed > 0xffffffff || (match[2].toUpperCase() === "E" && level !== 2)) return null;
  return { mode: match[2].toUpperCase() === "E" ? "endless" : "seed", level, seed: level === 1 ? 0 : seed, ...(match[1] !== "1" ? { version: Number(match[1]) as RoadVersion } : {}) };
}

/** One public map for each UTC day; the code remains playable after that day. */
export function dailyRoad(date = new Date()): RoadSpec {
  let seed = 2166136261;
  for (const character of date.toISOString().slice(0, 10)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return { mode: "seed", version: ROAD_RULES_VERSION, level: 5, seed: seed >>> 0 };
}
