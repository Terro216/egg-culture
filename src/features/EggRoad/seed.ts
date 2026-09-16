export type RoadMode = "practice" | "levels" | "endless" | "seed";
export type RoadSpec = { mode: RoadMode; level: number; seed: number };

export function newRoadSeed() { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }

// Keep this version stable: it identifies the generation rules as well as the random seed.
export function roadCode(spec: RoadSpec) {
  return `EGG1-${spec.mode === "endless" ? "E" : "R"}-${spec.level}-${(spec.level === 1 && spec.mode !== "endless" ? 0 : spec.seed).toString(36).toUpperCase()}`;
}

export function parseRoadCode(input: string): RoadSpec | null {
  let value = input.trim();
  if (value.length > 2048) return null;
  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).searchParams.get("road") ?? ""; } catch { return null; }
  }
  const match = /^EGG1-([RE])-(\d{1,4})-([0-9A-Z]{1,7})$/i.exec(value);
  if (!match) return null;
  const level = Number(match[2]), seed = parseInt(match[3], 36);
  if (level < 1 || level > 1000 || seed > 0xffffffff || (match[1].toUpperCase() === "E" && level !== 2)) return null;
  return { mode: match[1].toUpperCase() === "E" ? "endless" : "seed", level, seed: level === 1 ? 0 : seed };
}
