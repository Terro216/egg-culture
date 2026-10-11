import { analyzeBoard, isCampaignSeed, isDailySeed, isSlotPermutation, generatePuzzle, parseSeed } from "./engine.ts";
import type { Point } from "./types.ts";
import type { PortalTicket } from "../Portal/client.ts";

export type NestMode = "campaign" | "daily" | "free";
export type NestRecord = { seed: string; level: number; mode: NestMode; day?: string; moves: number; seconds: number; hints: number; solves?: number };
export type NestSession = {
  seed: string; mode: NestMode; day?: string; points: Point[]; moves: number; hints: number;
  seconds: number; ticket: PortalTicket; done: boolean;
};
export type NestProgress = { campaign: number[]; hardCampaign?: number[]; legacyCampaign?: number[]; campaignVersion?: 2; puzzles: NestRecord[]; totalSolved?: number; dailySolved?: number; dailyStreak?: number; bestDailyStreak?: number; hardSolved?: number };
const memory = new Map<string, string>();
const failedWrites = new Set<string>();
const RECORD_LIMIT = 256;
const prefix = "egg_untangle_v1";
const ownerKey = (owner: string | null) => owner ? `account:${encodeURIComponent(owner.normalize("NFKC").toLowerCase())}` : "guest";
export const nestKey = (owner: string | null, suffix: string) => `${prefix}:${ownerKey(owner)}:${suffix}`;
function read(key: string): unknown {
  try { return JSON.parse((failedWrites.has(key) ? memory.get(key) : localStorage.getItem(key)) ?? memory.get(key) ?? "null"); } catch { try { return JSON.parse(memory.get(key) ?? "null"); } catch { return null; } }
}
function write(key: string, value: unknown) {
  const text = JSON.stringify(value); memory.set(key, text);
  try { localStorage.setItem(key, text); failedWrites.delete(key); return true; } catch { failedWrites.add(key); return false; }
}
export function validRecord(value: unknown): value is NestRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as NestRecord;
  const parsed = parseSeed(r.seed);
  if (!parsed || parsed.seed !== r.seed || parsed.level !== r.level || !["campaign", "daily", "free"].includes(r.mode)) return false;
  if (r.mode === "campaign" && !isCampaignSeed(r.seed)) return false;
  if (r.mode === "daily" && (!r.day || !isDailySeed(r.seed, r.day))) return false;
  return Boolean((r.solves === undefined || Number.isSafeInteger(r.solves) && r.solves > 0)
    && Number.isSafeInteger(r.moves) && r.moves > 0 && r.moves <= 100000
    && Number.isSafeInteger(r.hints) && r.hints >= 0 && r.hints <= 100000
    && Number.isFinite(r.seconds) && r.seconds >= 0 && r.seconds <= 86400);
}
function betterRecord(first: NestRecord, second: NestRecord): NestRecord {
  const priority = { free: 0, campaign: 1, daily: 2 };
  const context = priority[first.mode] > priority[second.mode] ? first : second;
  return { ...context, moves: Math.min(first.moves, second.moves), seconds: Math.min(first.seconds, second.seconds), hints: Math.min(first.hints, second.hints),
    ...(first.solves || second.solves ? { solves: Math.max(first.solves ?? 1, second.solves ?? 1) } : {}) };
}
function boundedRecords(records: NestRecord[]): NestRecord[] {
  const unique = new Map<string, NestRecord>();
  for (const record of records) {
    const prior = unique.get(record.seed);
    unique.set(record.seed, prior ? betterRecord(prior, record) : record);
  }
  return [...unique.values()].sort((a, b) => Number(b.mode === "campaign") - Number(a.mode === "campaign")).slice(0, RECORD_LIMIT);
}
function normalizedProgress(value: NestProgress | null): NestProgress {
  const puzzles = Array.isArray(value?.puzzles) ? boundedRecords(value.puzzles.filter(validRecord)) : [];
  const levels = (list: unknown) => Array.isArray(list) ? list.filter(n => Number.isInteger(n) && n >= 1 && n <= 24) as number[] : [];
  const forVersions = (versions: readonly string[], list: unknown) => [...new Set([...levels(list), ...puzzles.filter(r => r.mode === "campaign" && versions.includes(parseSeed(r.seed)?.version ?? "")).map(r => r.level)])].sort((a, b) => a - b);
  const next: NestProgress = { campaignVersion: 2, campaign: forVersions(["NEST2", "NEST3"], value?.campaignVersion === 2 ? value.campaign : []),
    hardCampaign: forVersions(["KNOT1", "KNOT2"], value?.hardCampaign), legacyCampaign: forVersions(["NEST1"], [...levels(value?.legacyCampaign), ...(value?.campaignVersion !== 2 ? levels(value?.campaign) : [])]), puzzles };
  for (const field of ["totalSolved", "dailySolved", "dailyStreak", "bestDailyStreak", "hardSolved"] as const) {
    const number = value?.[field];
    if (typeof number === "number" && Number.isSafeInteger(number) && number >= 0) next[field] = number;
  }
  return next;
}
function recordKeys(owner: string | null): string[] {
  const start = nestKey(owner, "record:"), keys = new Set([...memory.keys()].filter(key => key.startsWith(start)));
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(start)) keys.add(key); } } catch { /* Current-tab records remain available. */ }
  return [...keys];
}
function pruneRecords(owner: string | null, puzzles: NestRecord[]) {
  const keep = new Set(puzzles.map(record => nestKey(owner, `record:${record.seed}`)));
  for (const key of recordKeys(owner)) if (!keep.has(key)) {
    memory.delete(key); failedWrites.delete(key);
    try { localStorage.removeItem(key); } catch { /* Reads still enforce the record limit. */ }
  }
}
export function readNestProgress(owner: string | null): NestProgress {
  const value = normalizedProgress(read(nestKey(owner, "progress")) as NestProgress | null);
  // Separate seed keys recover concurrent tabs' completions if their summary writes race.
  const journal = recordKeys(owner).reverse().map(read).filter(validRecord);
  return normalizedProgress({ ...value, puzzles: [...journal, ...value.puzzles] });
}
export function mergeNestProgress(owner: string | null, cloud: NestProgress): NestProgress {
  const old = readNestProgress(owner), incoming = normalizedProgress(cloud);
  const next = normalizedProgress({ ...old, ...incoming, campaign: [...old.campaign, ...incoming.campaign], hardCampaign: [...(old.hardCampaign ?? []), ...(incoming.hardCampaign ?? [])], legacyCampaign: [...(old.legacyCampaign ?? []), ...(incoming.legacyCampaign ?? [])], puzzles: [...incoming.puzzles, ...old.puzzles] });
  for (const field of ["totalSolved", "dailySolved", "bestDailyStreak", "hardSolved"] as const) {
    if (old[field] !== undefined || incoming[field] !== undefined) next[field] = Math.max(old[field] ?? 0, incoming[field] ?? 0);
  }
  write(nestKey(owner, "progress"), next); pruneRecords(owner, next.puzzles); return next;
}
export function saveNestRecord(owner: string | null, record: NestRecord): { progress: NestProgress; durable: boolean } {
  if (!validRecord(record)) throw new RangeError("Invalid nest record");
  const old = readNestProgress(owner), previous = old.puzzles.find(r => r.seed === record.seed);
  const best = previous ? betterRecord(previous, record) : record;
  const next = normalizedProgress({ ...old, puzzles: [best, ...old.puzzles.filter(r => r.seed !== record.seed)] });
  const journalDurable = write(nestKey(owner, `record:${record.seed}`), best);
  const durable = write(nestKey(owner, "progress"), next);
  pruneRecords(owner, next.puzzles);
  return { progress: next, durable: durable && journalDurable };
}
export function saveNestSession(session: NestSession): boolean {
  const sessionDurable = write(nestKey(session.ticket.owner, `session:${session.seed}`), session);
  const receiptDurable = session.done && session.ticket.owner === null
    ? write(nestKey(null, `receipt:${session.ticket.id}`), session) : true;
  const lastDurable = write(nestKey(session.ticket.owner, "last"), session.seed);
  return sessionDurable && receiptDurable && lastDurable;
}
export function readNestSession(owner: string | null, seed?: string): NestSession | null {
  const selected = seed ?? read(nestKey(owner, "last"));
  if (typeof selected !== "string" || !parseSeed(selected)) return null;
  return validSession(read(nestKey(owner, `session:${selected}`)), owner, selected);
}
function validSession(input: unknown, owner: string | null, selected?: string): NestSession | null {
  const value = input as NestSession | null;
  if (!value || !parseSeed(value.seed) || selected && value.seed !== selected || !value.ticket || value.ticket.owner !== owner || value.ticket.game !== "untangle"
    || !/^[0-9a-f-]{36}$/.test(value.ticket.id) || !["campaign", "daily", "free"].includes(value.mode)
    || typeof value.done !== "boolean" || !Number.isSafeInteger(value.moves) || value.moves < 0 || value.moves > 100000
    || !Number.isSafeInteger(value.hints) || value.hints < 0 || value.hints > 100000
    || !Number.isFinite(value.seconds) || value.seconds < 0 || value.seconds > 86400
    || !Array.isArray(value.points)) return null;
  const puzzle = generatePuzzle(value.seed);
  if (value.points.length !== puzzle.initial.length || value.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1000 || p.y < 0 || p.y > 1000)) return null;
  if (value.mode === "campaign" && !isCampaignSeed(value.seed)) return null;
  if (value.mode === "daily" && (!value.day || !isDailySeed(value.seed, value.day))) return null;
  if (puzzle.mechanics === "swap" && !isSlotPermutation(puzzle, value.points)) return null;
  if (value.done && !analyzeBoard(value.points, puzzle.edges).solved) return null;
  return value;
}

/** Completed guest proofs survive another attempt and can be explicitly claimed after login. */
export function guestNestResults(): NestSession[] {
  const start = nestKey(null, ""), keys = new Set([...memory.keys()].filter(key => key.startsWith(start)));
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(start)) keys.add(key); } } catch { /* Same-tab receipts remain available. */ }
  const results = new Map<string, NestSession>();
  for (const key of keys) {
    if (!key.startsWith(start + "receipt:") && !key.startsWith(start + "session:")) continue;
    const value = validSession(read(key), null);
    if (value?.done && value.moves > 0 && !read(nestKey(null, `claimed:${value.ticket.id}`))) results.set(value.ticket.id, value);
  }
  return [...results.values()].slice(-256);
}
export function markGuestNestClaimed(id: string, owner: string): void {
  write(nestKey(null, `claimed:${id}`), owner);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("egg:nest-guest"));
}
