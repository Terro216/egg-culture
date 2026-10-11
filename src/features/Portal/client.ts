import { parseMotionScores } from "../MotionTrials/scores.ts";
import { selectRoadAccount, readPointsBest, saveRoadScore } from "../EggRoad/storage.ts";
import { FRY_STORAGE_KEY, readFryProgress } from "../EggFry/storage.ts";
import { FRY_SEASON } from "../EggFry/rules.ts";
import { activePortalName, announceAchievements, portalStorageKey } from "./local.ts";
import { earnedAchievements, isAchievement, validatePortalRun } from "./model.ts";
import type { OwnProfile, PortalAccount, PortalGame, PortalRun } from "./model.ts";

export type PortalState = { account: PortalAccount | null; profile: OwnProfile | null; failed: boolean; syncing: boolean; unsynced: number; resultError?: "guest_result_claimed" };
export type PortalTicket = { id: string; game: PortalGame; owner: string | null; season?: 2 | 3; roadRules?: 1 | 2; guestImport?: true };
let state: PortalState = { account: null, profile: null, failed: false, syncing: false, unsynced: 0 };
let request: AbortController | null = null, generation = 0;
// Refreshing the same profile must not invalidate its pending writes or outbox.
let ownerRevision = 0;
let flushing = false;
let latestRead: Promise<void> | null = null;
const memoryQueue = new Map<string, PortalRun[]>();
const normalized = (name: string) => name.normalize("NFKC").toLowerCase();
const accountOwner = (account: PortalAccount | null) => account?.registered ? normalized(account.name) : null;
function ownsAccount(name: string, revision: number) {
  return revision === ownerRevision && accountOwner(state.account) === normalized(name) && activePortalName() === normalized(name);
}
function publish() { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("egg:portal", { detail: state })); }
export function portalState() { return state; }
export function portalIdentityReady(value = state) { return Boolean(value.account) && (value.account?.registered ? normalized(value.account.name) : null) === activePortalName(); }
function pending(name: string): PortalRun[] {
  const runs = new Map((memoryQueue.get(name) ?? []).map(run => [run.id, run]));
  const prefix = portalStorageKey("egg_portal_outbox_v1", name) + ":";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const run = validatePortalRun(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (run) runs.set(run.id, run);
    }
  } catch { /* Fall back to this tab. */ }
  return [...runs.values()];
}
function enqueue(name: string, run: PortalRun) {
  memoryQueue.set(name, [...pending(name).filter(r => r.id !== run.id), run]);
  // One key per run: simultaneous games in two tabs cannot overwrite an outbox array.
  try { localStorage.setItem(portalStorageKey("egg_portal_outbox_v1", name) + ":" + run.id, JSON.stringify(run)); return true; } catch { return false; /* This tab retains the pending run. */ }
}
function durablyPending(name: string, run: PortalRun) {
  try {
    const value = validatePortalRun(JSON.parse(localStorage.getItem(portalStorageKey("egg_portal_outbox_v1", name) + ":" + run.id) ?? "null"));
    return value !== null && JSON.stringify(value) === JSON.stringify(run);
  } catch { return false; }
}
function acknowledge(name: string, id: string) {
  memoryQueue.set(name, (memoryQueue.get(name) ?? []).filter(r => r.id !== id));
  try { localStorage.removeItem(portalStorageKey("egg_portal_outbox_v1", name) + ":" + id); } catch { /* A later duplicate is harmless on the server. */ }
}
async function post(body: unknown) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch("/api/portal-profile", { method: "POST", credentials: "same-origin", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(error?.error ?? "unavailable");
    }
    return await response.json() as { profile: OwnProfile };
  } finally { clearTimeout(timer); }
}
function mergeProfile(profile: OwnProfile, name: string) {
  if (activePortalName() !== normalized(name)) return;
  try {
    for (const stat of profile.stats) {
      if (stat.game === "fry") {
        if (profile.frySeason !== FRY_SEASON) continue;
        const old = readFryProgress(name);
        const best = BigInt(old.best) > BigInt(stat.best) ? old.best : stat.best;
        localStorage.setItem(portalStorageKey(FRY_STORAGE_KEY, name), JSON.stringify({ ...old, best, peak: BigInt(old.peak) > BigInt(best) ? old.peak : best,
          achievements: [...new Set([...old.achievements, ...profile.achievements.filter(a => a.startsWith("fry.")).map(a => a.slice(4))])] }));
      } else if (stat.game === "road") {
        const mode = stat.roadRules === 2 ? "portal-v2" : "portal";
        if (Number(stat.best) > readPointsBest(mode)) saveRoadScore(mode, Number(stat.best));
      } else if (stat.game === "chalaza" || stat.game === "oracle") {
        const key = portalStorageKey("egg_motion_trials_v1", name);
        let stored: unknown; try { stored = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { /* Repair malformed cached scores from cloud. */ }
        const scores = parseMotionScores(stored);
        localStorage.setItem(key, JSON.stringify({ ...scores, [stat.game]: Math.max(Number(scores[stat.game]) || 0, Number(stat.best)) }));
      }
    }
    const key = portalStorageKey("egg_portal_achievements_v1", name);
    const old = JSON.parse(localStorage.getItem(key) ?? "[]");
    localStorage.setItem(key, JSON.stringify([...new Set([...(Array.isArray(old) ? old.filter(isAchievement) : []), ...profile.achievements.filter(isAchievement)])]));
  } catch { /* Account access never depends on browser storage. */ }
}
async function readPortal() {
  request?.abort(); const abort = new AbortController(); request = abort;
  const revision = ++generation, timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch("/api/portal-profile", { credentials: "same-origin", cache: "no-store", signal: abort.signal });
    if (!response.ok) throw new Error("Profile unavailable");
    const data = await response.json() as { account: PortalAccount; profile: OwnProfile | null };
    if (revision !== generation || abort.signal.aborted) return;
    if (accountOwner(state.account) !== accountOwner(data.account)) ++ownerRevision;
    selectRoadAccount(data.account.registered ? data.account.name : null);
    state = { account: data.account, profile: data.profile, failed: false, syncing: false, unsynced: data.account.registered ? pending(normalized(data.account.name)).length : 0 };
    if (data.profile) mergeProfile(data.profile, data.account.name);
    publish(); void flushPortal();
  } catch { if (revision === generation) { state = { ...state, failed: true }; publish(); } }
  finally { clearTimeout(timer); if (request === abort) request = null; }
}
export function refreshPortal() {
  latestRead = readPortal();
  return latestRead;
}
/** A newer identity read may cancel the one a caller awaited. Wait for that read too. */
export async function settledPortal() {
  if (!latestRead) refreshPortal();
  while (true) {
    const read = latestRead;
    await read;
    if (read === latestRead) return state;
  }
}
export function beginPortalRun(game: PortalGame, roadRules?: 1 | 2): PortalTicket { return { id: globalThis.crypto.randomUUID(), game, owner: activePortalName(), ...(game === "fry" ? { season: FRY_SEASON } : {}), ...(game === "road" && roadRules === 2 ? { roadRules } : {}) }; }
function queuePortalResult(ticket: PortalTicket, values: Omit<PortalRun, "id" | "game" | "season">) {
  const run = validatePortalRun({ ...values, id: ticket.id, game: ticket.game, guestImport: ticket.guestImport, ...(ticket.game === "fry" ? { season: ticket.season ?? 2 } : {}), ...(ticket.game === "road" ? { roadRules: ticket.roadRules } : {}) });
  if (!run) return { accepted: false, durable: false };
  // Guest transfers are provisional until the server accepts their unique owner.
  // Their authoritative profile receipt will announce badges in flushPortal.
  if (!run.guestImport) announceAchievements(earnedAchievements(run), ticket.owner);
  if (!ticket.owner) return { accepted: true, durable: false };
  const queue = pending(ticket.owner);
  const existing = queue.find(r => r.id === run.id);
  // Retrying a memory-only guest import must retry its durable write too, while
  // preserving the exact payload already associated with that UUID.
  const durable = existing && durablyPending(ticket.owner, existing) || enqueue(ticket.owner, existing ?? run);
  if (activePortalName() === ticket.owner) { state = { ...state, unsynced: pending(ticket.owner).length }; publish(); void flushPortal(); }
  return { accepted: true, durable: Boolean(durable) };
}
export function submitPortalResult(ticket: PortalTicket, values: Omit<PortalRun, "id" | "game" | "season">) { return queuePortalResult(ticket, values).accepted; }
/** Call only from an explicit save-to-this-profile action for a completed guest puzzle. */
export async function importGuestPortalResult(ticket: PortalTicket, values: Omit<PortalRun, "id" | "game" | "season">, expectedOwner: string): Promise<PortalTicket | null> {
  if (ticket.owner !== null || ticket.game !== "untangle" || !expectedOwner) return null;
  const name = normalized(expectedOwner), revision = ownerRevision;
  if (!ownsAccount(name, revision)) return null;
  await settledPortal();
  if (!ownsAccount(name, revision) || state.failed || !state.account?.registered) return null;
  const adopted: PortalTicket = { id: ticket.id, game: "untangle", owner: name, guestImport: true };
  state = { ...state, resultError: undefined };
  const queued = queuePortalResult(adopted, values);
  // The caller hides the guest proof only after this receipt. A successful small
  // claim marker must never hide a proof whose larger outbox write hit quota.
  return queued.accepted && queued.durable ? adopted : null;
}
export async function flushPortal() {
  if (flushing || !state.account?.registered || state.failed) return;
  const name = normalized(state.account.name), revision = ownerRevision;
  if (name !== activePortalName()) return;
  flushing = true;
  try {
    while (pending(name).length && ownsAccount(name, revision) && !state.failed) {
      const run = pending(name)[0]; state = { ...state, syncing: true }; publish();
      let data: { profile: OwnProfile };
      try { data = await post({ action: "result", expectedName: name, run }); }
      catch (error) {
        // A permanent cross-account guest claim must not block unrelated future
        // results. All uncertain/network failures retain their exact UUID as before.
        if (run.guestImport && error instanceof Error && error.message === "guest_result_claimed") {
          acknowledge(name, run.id);
          if (ownsAccount(name, revision)) state = { ...state, resultError: "guest_result_claimed" };
          continue;
        }
        throw error;
      }
      acknowledge(name, run.id);
      if (!ownsAccount(name, revision)) break;
      announceAchievements(data.profile.achievements.filter(isAchievement), name);
      mergeProfile(data.profile, name); state = { ...state, profile: data.profile, unsynced: pending(name).length };
    }
  } catch { /* Retain the exact run ID for a safe retry, including after a lost response. */ }
  finally { flushing = false; state = { ...state, syncing: false, unsynced: state.account?.registered ? pending(normalized(state.account.name)).length : 0 }; publish();
    if (revision !== ownerRevision && state.account?.registered) void flushPortal();
  }
}
export async function saveProfileSettings(publicProfile: boolean, avatar: number) {
  if (!state.account?.registered) throw new Error("Sign in first");
  const name = state.account.name, revision = ownerRevision;
  if (!ownsAccount(name, revision)) throw new Error("Account changed");
  const data = await post({ action: "settings", expectedName: name, public: publicProfile, avatar });
  if (!ownsAccount(name, revision)) throw new Error("Account changed");
  state = { ...state, profile: data.profile }; publish();
}
export async function saveProfileSlug(slug: string) {
  if (!state.account?.registered) throw new Error("Sign in first");
  const name = state.account.name, revision = ownerRevision;
  if (!ownsAccount(name, revision)) throw new Error("Account changed");
  const data = await post({ action: "slug", expectedName: name, slug });
  if (!ownsAccount(name, revision)) throw new Error("Account changed");
  state = { ...state, profile: data.profile }; publish();
}

/** Safe to retry: completion is an account-scoped idempotent fact. */
export async function completeInitiation(answers: number[]) {
  await settledPortal();
  if ((state.account?.registered ? normalized(state.account.name) : null) !== activePortalName()) throw new Error("account_changed");
  if (!state.account || state.failed) throw new Error("unavailable");
  if (!state.account.registered) return;
  const name = state.account.name, revision = ownerRevision;
  const data = await post({ action: "initiation", expectedName: name, answers });
  if (!ownsAccount(name, revision)) throw new Error("account_changed");
  state = { ...state, profile: data.profile }; publish();
}
