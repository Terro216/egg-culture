import type { RoadResult } from "./simulation.ts";
import { activeRoadAccount } from "./storage.ts";
import { parseRoadCode } from "./seed.ts";
import { FUN_ROAD_CODES } from "./funRoads.ts";

export type SavedRoadRun = { schema: 1; id: string; owner: string | null; created: number; published: boolean; completionRecorded?: boolean; result: RoadResult };
export const isFunFinish = (run: SavedRoadRun) => run.result.finished && FUN_ROAD_CODES.includes(run.result.code);
/** Keep one finish even when an unfinished attempt earned more points. */
export function completedFunRuns(history: SavedRoadRun[]) {
  const finishes = new Map<string, SavedRoadRun>();
  for (const run of history) if (isFunFinish(run) && (!finishes.has(run.result.code) || run.completionRecorded && !finishes.get(run.result.code)!.completionRecorded)) finishes.set(run.result.code, run);
  return finishes;
}
const prefix = "egg_road_runs_v1:";
const memory = new Map<string, SavedRoadRun>();
const key = (id: string) => prefix + id;
function valid(value: unknown): value is SavedRoadRun {
  if (!value || typeof value !== "object") return false;
  const run = value as SavedRoadRun, result = run.result;
  return run.schema === 1 && typeof run.id === "string" && /^[0-9a-f-]{36}$/.test(run.id) &&
    (run.owner === null || typeof run.owner === "string") && Number.isFinite(run.created) && typeof run.published === "boolean" &&
    !!result && !!parseRoadCode(result.code) && Number.isSafeInteger(result.score) && result.score >= 0 &&
    Number.isFinite(result.seconds) && Number.isFinite(result.distance) && !!result.breakdown &&
    Object.values(result.breakdown).every(n => Number.isSafeInteger(n) && n >= 0);
}
export function roadHistory(owner = activeRoadAccount()) {
  const runs = new Map(memory);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(prefix)) continue;
      try {
        const run = JSON.parse(localStorage.getItem(name) ?? "null");
        if (valid(run)) {
          const cached = runs.get(run.id);
          runs.set(run.id, { ...run, published: run.published || !!cached?.published, completionRecorded: run.completionRecorded || cached?.completionRecorded });
        }
      } catch { /* A damaged entry must not hide other results. */ }
    }
  } catch { /* This tab still retains results when storage is blocked. */ }
  return [...runs.values()].filter(run => run.owner === owner).sort((a, b) => b.created - a.created);
}
export function bestRoadResult(code: string, owner = activeRoadAccount()) {
  return roadHistory(owner).filter(run => run.result.code === code).sort((a, b) => b.result.score - a.result.score || b.created - a.created)[0] ?? null;
}
export function saveRoadResult(ticket: { id: string; owner: string | null }, result: RoadResult) {
  const run: SavedRoadRun = { schema: 1, ...ticket, result: structuredClone(result), created: Date.now(), published: false };
  memory.set(run.id, run);
  let durable = true;
  try { localStorage.setItem(key(run.id), JSON.stringify(run)); } catch { durable = false; }
  // Keep the latest 12, each map's best, and one finish for each fun road.
  const history = roadHistory(ticket.owner), keep = new Set(history.slice(0, 12).map(r => r.id));
  const best = new Map<string, SavedRoadRun>();
  for (const candidate of history) if (candidate.result.score > (best.get(candidate.result.code)?.result.score ?? -1)) best.set(candidate.result.code, candidate);
  for (const candidate of best.values()) keep.add(candidate.id);
  for (const candidate of completedFunRuns(history).values()) keep.add(candidate.id);
  for (const candidate of history) if (!keep.has(candidate.id)) {
    memory.delete(candidate.id);
    try { localStorage.removeItem(key(candidate.id)); } catch { /* Retry cleanup after a future run. */ }
  }
  return { run, durable };
}
export function markRoadPublished(run: SavedRoadRun, completionRecorded = false) {
  const saved = { ...run, published: true, completionRecorded: run.completionRecorded || completionRecorded }; memory.set(run.id, saved);
  try { localStorage.setItem(key(run.id), JSON.stringify(saved)); } catch { /* Publishing already succeeded. */ }
}
