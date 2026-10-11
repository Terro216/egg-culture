export type Size = "S" | "M" | "L";
export type Temp = "fridge" | "room";
export type Doneness = "soft" | "medium" | "hard";
export type CeremonyState = "idle" | "running" | "paused" | "done";

export interface CalculatorState {
  version: 1;
  size: Size;
  temp: Temp;
  doneness: Doneness;
  soundOn: boolean;
  ceremony: CeremonyState;
  totalMs: number;
  remainingMs: number;
  endAt: number;
}

// One ceremony follows the visitor between both language versions and tabs.
export const CALCULATOR_STORAGE_KEY = "egg-calculator-v1";

export function defaultCalculatorState(): CalculatorState {
  return {
    version: 1,
    size: "M",
    temp: "fridge",
    doneness: "soft",
    soundOn: true,
    ceremony: "idle",
    totalMs: 0,
    remainingMs: 0,
    endAt: 0,
  };
}

export function remainingCalculatorMs(state: CalculatorState, now: number) {
  return state.ceremony === "running"
    ? Math.max(0, Math.min(state.totalMs, state.endAt - now))
    : state.remainingMs;
}

export function parseCalculatorState(raw: string | null, now: number): CalculatorState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const state = value as CalculatorState;
    if (
      state.version !== 1 ||
      !["S", "M", "L"].includes(state.size) ||
      !["fridge", "room"].includes(state.temp) ||
      !["soft", "medium", "hard"].includes(state.doneness) ||
      typeof state.soundOn !== "boolean" ||
      !["idle", "running", "paused", "done"].includes(state.ceremony) ||
      !Number.isFinite(state.totalMs) || state.totalMs < 0 || state.totalMs > 86_400_000 ||
      !Number.isFinite(state.remainingMs) || state.remainingMs < 0 || state.remainingMs > state.totalMs ||
      !Number.isSafeInteger(state.endAt) || state.endAt < 0
    ) return null;

    if (state.ceremony === "idle") {
      if (state.totalMs !== 0 || state.remainingMs !== 0 || state.endAt !== 0) return null;
    } else {
      if (state.totalMs === 0) return null;
      if (state.ceremony === "running") {
        if (state.endAt === 0) return null;
        if (state.endAt <= now) return { ...state, ceremony: "done", remainingMs: 0, endAt: 0 };
      } else {
        if (state.endAt !== 0) return null;
        if (state.ceremony === "paused" && state.remainingMs === 0) return null;
        if (state.ceremony === "done" && state.remainingMs !== 0) return null;
      }
    }
    return state;
  } catch {
    return null;
  }
}

export function loadCalculatorState(storage: Pick<Storage, "getItem">, now: number) {
  try {
    return parseCalculatorState(storage.getItem(CALCULATOR_STORAGE_KEY), now);
  } catch {
    return null;
  }
}

export function saveCalculatorState(storage: Pick<Storage, "setItem">, state: CalculatorState) {
  try {
    storage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
