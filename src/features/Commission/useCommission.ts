import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, initialState, moscowDay, newRun, restoreRun } from "./engine.ts";
import { EMPTY, isPrefix, ownerKey, readLocal, reconcile, writeLocal } from "./storage.ts";
import type { Envelope } from "./storage.ts";
import type { Action, Run, State } from "./types.ts";

type Ranking = { rank: number; name: string; score: number; correct: number; errors: number; time: number; own: boolean };
type ResponseData = { owner: string | null; run: Run | null; revision: number; achievements: string[]; standings: Ranking[]; published: boolean; today: string };
export type SyncStatus = "loading" | "local" | "saved" | "saving" | "offline" | "conflict";
type View = { owner: string | null; envelope: Envelope; state: State | null; status: SyncStatus; storageFailed: boolean; corrupt: boolean; achievements: string[]; standings: Ranking[]; published: boolean; today: string; conflict: ResponseData | null };
const initial: View = { owner: null, envelope: { ...EMPTY }, state: null, status: "loading", storageFailed: false, corrupt: false, achievements: [], standings: [], published: false, today: "", conflict: null };
const API = "/api/commission";

export function useCommission() {
  const [slot, setSlot] = useState("campaign");
  const [view, setView] = useState<View>(initial);
  const ref = useRef(view); ref.current = view;
  const slotRef = useRef(slot); slotRef.current = slot;
  const generation = useRef(0), verified = useRef(false), busy = useRef(false);
  const persist = useCallback((next: View, targetSlot = slotRef.current) => {
    next.storageFailed = !writeLocal(next.owner, targetSlot, next.envelope) || next.storageFailed;
    ref.current = next; setView(next);
  }, []);

  const load = useCallback(async () => {
    const epoch = ++generation.current, targetSlot = slotRef.current;
    verified.current = false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API}?slot=${encodeURIComponent(targetSlot)}&date=${targetSlot.startsWith("daily:") ? targetSlot.slice(6) : moscowDay()}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("offline");
      const data = await res.json() as ResponseData;
      if (epoch !== generation.current || targetSlot !== slotRef.current) return;
      if (data.run && !restoreRun(data.run)) throw new Error("corrupt");
      const previous = ref.current;
      const same = ownerKey(previous.owner) === ownerKey(data.owner) && previous.status !== "loading";
      const stored = readLocal(data.owner, targetSlot);
      const local = same ? previous.envelope : stored.value;
      const resolved = data.owner ? reconcile(local, data) : { value: local, conflict: false };
      const restored = resolved.value.run && restoreRun(resolved.value.run);
      verified.current = true;
      try { localStorage.setItem("egg_commission_last_owner", JSON.stringify(data.owner)); } catch { /* memory-only play remains possible */ }
      persist({ owner: data.owner, envelope: resolved.value, state: restored ? restored.state : null, status: resolved.conflict ? "conflict" : data.owner ? resolved.value.dirty ? "saving" : "saved" : "local",
        storageFailed: stored.unavailable || (same && previous.storageFailed), corrupt: stored.corrupt, achievements: data.achievements,
        standings: data.standings, published: data.published, today: data.today, conflict: resolved.conflict ? data : null }, targetSlot);
    } catch {
      if (epoch !== generation.current || targetSlot !== slotRef.current) return;
      let previous = ref.current;
      if (previous.status === "loading") {
        let owner: string | null = null;
        try { const name = JSON.parse(localStorage.getItem("egg_commission_last_owner") ?? "null"); if (typeof name === "string") owner = name; } catch { /* guest */ }
        const local = readLocal(owner, targetSlot), restored = local.value.run && restoreRun(local.value.run);
        previous = { ...initial, owner, envelope: local.value, state: restored ? restored.state : null, storageFailed: local.unavailable, corrupt: local.corrupt };
      }
      const next = { ...previous, today: previous.today || moscowDay(), status: "offline" as const };
      ref.current = next; setView(next);
    } finally { clearTimeout(timer); }
  }, [persist]);

  useEffect(() => {
    generation.current++; verified.current = false;
    ref.current = { ...initial }; setView({ ...initial }); void load();
    const refresh = () => { if (!document.hidden && !busy.current) void load(); };
    const identityChanged = () => { generation.current++; verified.current = false; ref.current = { ...initial }; setView({ ...initial }); void load(); };
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh); window.addEventListener("egg:account", identityChanged);
    return () => { generation.current++; window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("egg:account", identityChanged); };
  }, [slot, load]);

  const flush = useCallback(async (): Promise<boolean> => {
    const snap = ref.current, targetSlot = slotRef.current, epoch = generation.current;
    if (!snap.owner || !snap.envelope.run || !snap.envelope.dirty) return !snap.envelope.dirty || !snap.owner;
    if (busy.current || !verified.current || snap.conflict) return false;
    busy.current = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action: "save", expectedName: snap.owner, revision: snap.envelope.revision, replace: snap.envelope.replace, run: snap.envelope.run }) });
      const data = await response.json();
      if (epoch !== generation.current || targetSlot !== slotRef.current || ref.current.owner !== snap.owner) return false;
      if (!response.ok) {
        if (response.status === 409 || response.status === 401) { busy.current = false; await load(); return false; }
        throw new Error("offline");
      }
      const current = ref.current;
      if (current.envelope.run?.id !== snap.envelope.run.id) {
        persist({ ...current, envelope: { ...current.envelope, revision: data.revision, replace: true }, status: "saving" });
      } else {
        const dirty = current.envelope.run.actions.length !== snap.envelope.run.actions.length;
        persist({ ...current, envelope: { ...current.envelope, revision: data.revision, dirty, replace: false }, achievements: data.achievements, status: dirty ? "saving" : "saved" });
      }
      return true;
    } catch {
      if (epoch === generation.current && ref.current.owner === snap.owner) persist({ ...ref.current, status: "offline" });
      return false;
    } finally {
      busy.current = false; clearTimeout(timer);
      // A slot/account change may have scheduled a save while this request was
      // still in flight. Re-arm that pending save when the shared lock clears.
      if (ref.current.status === "saving" && ref.current.envelope.dirty && verified.current) {
        setView(current => ({ ...current, envelope: { ...current.envelope } }));
      }
    }
  }, [load, persist]);

  useEffect(() => {
    if (view.status !== "saving" || !view.envelope.dirty || !view.owner) return;
    const timer = setTimeout(() => void flush(), 900); return () => clearTimeout(timer);
  }, [view.envelope, view.status, view.owner, flush]);

  const adopt = useCallback((run: Run) => {
    const restored = restoreRun(run); if (!restored) throw new Error("invalid_run");
    const v = ref.current;
    if (v.status === "loading") throw new Error("loading");
    persist({ ...v, envelope: { run: restored.run, revision: v.envelope.revision, dirty: true, replace: Boolean(v.envelope.run) }, state: restored.state,
      status: v.conflict ? "conflict" : v.owner && verified.current ? "saving" : v.status === "offline" ? "offline" : "local", corrupt: false });
  }, [persist]);
  const act = useCallback((action: Action) => {
    const v = ref.current; if (!v.state || !v.envelope.run || v.status === "loading") return;
    const state = applyAction(v.state, action), run = { ...v.envelope.run, actions: [...v.envelope.run.actions, action] };
    persist({ ...v, state, envelope: { ...v.envelope, run, dirty: true }, status: v.conflict ? "conflict" : v.owner && verified.current ? "saving" : v.status === "offline" ? "offline" : "local" });
  }, [persist]);
  const begin = useCallback(() => adopt(newRun(slotRef.current.startsWith("daily:") ? "daily" : "campaign", slotRef.current.startsWith("daily:") ? slotRef.current.slice(6) : moscowDay())), [adopt]);
  const resolveConflict = useCallback((useCloud: boolean) => {
    const v = ref.current, cloud = v.conflict; if (!cloud) return;
    if (useCloud) {
      const restored = cloud.run && restoreRun(cloud.run);
      persist({ ...v, envelope: { run: cloud.run, revision: cloud.revision, dirty: false, replace: false }, state: restored ? restored.state : null, conflict: null, status: "saved" });
    } else persist({ ...v, envelope: { ...v.envelope, revision: cloud.revision, dirty: true, replace: true }, conflict: null, status: "saving" });
  }, [persist]);
  const importGuest = useCallback(() => {
    if (!ref.current.owner) return false;
    const guest = readLocal(null, slotRef.current).value.run;
    if (!guest) return false; adopt(guest); return true;
  }, [adopt]);
  const publish = useCallback(async (enabled: boolean) => {
    if (!ref.current.owner || !ref.current.state || ref.current.state.mode !== "daily") return false;
    if (!await flush()) return false;
    const v = ref.current, owner = v.owner, epoch = generation.current;
    try {
      const res = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", expectedName: owner, date: v.state!.date, enabled }) });
      if (!res.ok) return false;
      const data = await res.json();
      if (epoch !== generation.current || ref.current.owner !== owner) return false;
      persist({ ...ref.current, standings: data.standings, published: data.published }); return true;
    } catch { return false; }
  }, [flush, persist]);
  const switchMode = useCallback((mode: "campaign" | "daily") => { void flush(); setSlot(mode === "campaign" ? "campaign" : `daily:${ref.current.today || moscowDay()}`); }, [flush]);
  return { ...view, slot, act, begin, adopt, reload: load, flush, resolveConflict, importGuest, publish, switchMode,
    guestAvailable: view.owner ? Boolean(readLocal(null, slot).value.run) : false };
}
