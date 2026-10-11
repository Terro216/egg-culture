import { activeRoadAccount } from "./storage.ts";
import { completedFunRuns, isFunFinish, markRoadPublished, roadHistory } from "./results.ts";
import type { SavedRoadRun } from "./results.ts";
import type { RoadLeaderboard } from "./leaderboard.ts";
import { portalState } from "../Portal/client.ts";
import { announceAchievements } from "../Portal/local.ts";
import { isAchievement } from "../Portal/model.ts";

export type RoadPublication = { status: "idle" | "sending" | "saved" | "error" | "limited" | "taken" | "account"; data?: RoadLeaderboard };
export const ROAD_PUBLICATION_EVENT = "egg:road-publication";
const states = new Map<string, RoadPublication>();
const pending = new Map<string, Promise<RoadPublication>>();
const retryAfter = new Map<string, number>();
let flushing: Promise<void> | null = null, again = false, observers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let observedOwner: string | null = null;

export function roadPublication(run: SavedRoadRun | null): RoadPublication {
  return run ? states.get(run.id) ?? { status: run.published ? "saved" : "idle" } : { status: "idle" };
}
function announce(run: SavedRoadRun, state: RoadPublication) {
  states.set(run.id, state);
  if (states.size > 128) for (const id of states.keys()) {
    if (id !== run.id && !pending.has(id)) { states.delete(id); break; }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ROAD_PUBLICATION_EVENT, { detail: { run, state } }));
  return state;
}

/** Shared by automatic account sync and explicit guest publication. Changing
 * maps cannot cancel this request; the server checks the frozen run owner. */
export function publishRoadRun(run: SavedRoadRun, name: string): Promise<RoadPublication> {
  const current = pending.get(run.id); if (current) return current;
  if (run.owner !== activeRoadAccount()) return Promise.resolve(announce(run, { status: "account" }));
  if (run.result.score <= 0 || !name.trim()) return Promise.resolve({ status: "idle" });
  const request = (async (): Promise<RoadPublication> => {
    announce(run, { status: "sending" });
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10000);
    try {
      const result = run.result;
      const response = await fetch("/api/egg-road-records", { method: "POST", credentials: "same-origin", signal: abort.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...result, name, expectedOwner: run.owner }) });
      if (!response.ok) {
        const issue = await response.json().catch(() => null) as { error?: string } | null;
        retryAfter.set(run.id, response.status === 400 || response.status === 409 ? Infinity : Date.now() + 60000);
        return announce(run, { status: response.status === 429 ? "limited" : response.status === 409 ? issue?.error === "account_changed" ? "account" : "taken" : "error" });
      }
      const data = await response.json() as RoadLeaderboard;
      if (data.code !== result.code) throw new Error("Wrong leaderboard");
      markRoadPublished(run, isFunFinish(run) && !!data.completedRoads?.includes(run.result.code)); retryAfter.delete(run.id);
      if (data.unlocked) announceAchievements(data.unlocked.filter(isAchievement), run.owner);
      if (run.owner === activeRoadAccount()) {
        try { localStorage.setItem("egg_road_name_v1", data.name); } catch { /* The server already saved the score. */ }
      }
      return announce(run, { status: "saved", data });
    } catch {
      retryAfter.set(run.id, Date.now() + 15000);
      return announce(run, { status: "error" });
    } finally { clearTimeout(timeout); }
  })();
  pending.set(run.id, request);
  void request.finally(() => pending.delete(run.id));
  return request;
}

export function flushRoadRecords() {
  if (flushing) { again = true; return flushing; }
  flushing = (async () => {
    do {
      again = false;
      const account = portalState().account, owner = activeRoadAccount();
      if (!owner || !account?.registered || account.name.normalize("NFKC").toLowerCase() !== owner ||
          (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      // A finish also counts when it scores below a previously unfinished best.
      const history = roadHistory(owner), finishes = completedFunRuns(history);
      const best = new Map<string, SavedRoadRun>();
      for (const run of history) if (run.result.score > (best.get(run.result.code)?.result.score ?? -1)) best.set(run.result.code, run);
      const candidates = new Map([...best.values(), ...finishes.values()].map(run => [run.id, run]));
      for (const run of candidates.values()) {
        if (activeRoadAccount() !== owner) return;
        const pendingFinish = isFunFinish(run) && !finishes.get(run.result.code)?.completionRecorded;
        if (!pendingFinish && best.get(run.result.code)?.id !== run.id) continue;
        if (!pendingFinish && (run.published || roadPublication(run).status === "saved") || run.result.score <= 0 || Date.now() < (retryAfter.get(run.id) ?? 0)) continue;
        const state = await publishRoadRun(run, account.name);
        if (state.status !== "saved") break;
        if (state.data?.completedRoads?.includes(run.result.code) && isFunFinish(run)) finishes.set(run.result.code, { ...run, completionRecorded: true });
      }
    } while (again);
  })().finally(() => {
    flushing = null;
    clearTimeout(timer);
    const owner = activeRoadAccount();
    if (observers && owner && roadHistory(owner).some(run => (!run.published || isFunFinish(run) && !run.completionRecorded) && Number.isFinite(retryAfter.get(run.id)))) {
      timer = setTimeout(() => { void flushRoadRecords(); }, 15000);
    }
  });
  return flushing;
}

/** Resume pending personal bests after reconnect, reload or signing back in. */
export function watchRoadRecordSync() {
  const resume = () => { void flushRoadRecords(); };
  if (++observers === 1) {
    window.addEventListener("online", resumeSync);
    window.addEventListener("egg:portal", resumeSync);
    window.addEventListener("storage", resumeSync);
  }
  resume();
  return () => {
    if (--observers) return;
    clearTimeout(timer);
    window.removeEventListener("online", resumeSync);
    window.removeEventListener("egg:portal", resumeSync);
    window.removeEventListener("storage", resumeSync);
  };
}
function resumeSync(event: Event) {
  const owner = activeRoadAccount();
  for (const run of owner ? roadHistory(owner) : []) {
    if (event.type === "online" && Number.isFinite(retryAfter.get(run.id)) || owner !== observedOwner && roadPublication(run).status === "account") retryAfter.delete(run.id);
  }
  observedOwner = owner;
  void flushRoadRecords();
}
