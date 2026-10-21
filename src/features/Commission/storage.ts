import { restoreRun } from "./engine.ts";
import type { Run } from "./types.ts";

export type Envelope = { run: Run | null; revision: number; dirty: boolean; replace: boolean };
export const EMPTY: Envelope = { run: null, revision: 0, dirty: false, replace: false };
export const ownerKey = (name: string | null) => name ? `account:${name.normalize("NFKC").toLowerCase()}` : "guest";
export const storageKey = (owner: string | null, slot: string) => `egg_commission_v1:${encodeURIComponent(ownerKey(owner))}:${slot}`;
export function readLocal(owner: string | null, slot: string): { value: Envelope; unavailable: boolean; corrupt: boolean } {
  try {
    const raw = localStorage.getItem(storageKey(owner, slot));
    if (!raw) return { value: { ...EMPTY }, unavailable: false, corrupt: false };
    let value;
    try { value = JSON.parse(raw); } catch { value = null; }
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || (value.run !== null && !restoreRun(value.run))) {
      localStorage.setItem(`${storageKey(owner, slot)}:recovery`, raw);
      return { value: { ...EMPTY }, unavailable: false, corrupt: true };
    }
    return { value: { run: value.run, revision: value.revision, dirty: value.dirty === true, replace: value.replace === true }, unavailable: false, corrupt: false };
  } catch { return { value: { ...EMPTY }, unavailable: true, corrupt: false }; }
}
export function writeLocal(owner: string | null, slot: string, value: Envelope): boolean {
  try { localStorage.setItem(storageKey(owner, slot), JSON.stringify(value)); return true; } catch { return false; }
}
export function isPrefix(a: Run, b: Run) {
  return a.id === b.id && a.seed === b.seed && a.mode === b.mode && a.date === b.date && a.actions.length <= b.actions.length && JSON.stringify(a.actions) === JSON.stringify(b.actions.slice(0, a.actions.length));
}
export function reconcile(local: Envelope, remote: { run: Run | null; revision: number }): { value: Envelope; conflict: boolean } {
  if (!local.run) return { value: { ...remote, dirty: false, replace: false }, conflict: false };
  if (!remote.run) return { value: { ...local, revision: remote.revision, dirty: true }, conflict: false };
  if (isPrefix(local.run, remote.run)) return { value: { ...remote, dirty: false, replace: false }, conflict: false };
  if (isPrefix(remote.run, local.run)) return { value: { ...local, revision: remote.revision, dirty: true, replace: false }, conflict: false };
  if (local.dirty) return { value: local, conflict: true };
  return { value: { ...remote, dirty: false, replace: false }, conflict: false };
}
