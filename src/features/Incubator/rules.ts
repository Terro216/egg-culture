export type IncubatorState = {
  startedAt: string; lastWarm: string; streak: number; qi: number; burns: number; totalWarmed: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function incubatorDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
export function daysBetween(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
export function validIncubatorState(value: unknown, today = incubatorDay()): value is IncubatorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (!DAY.test(String(state.startedAt)) || !DAY.test(String(state.lastWarm))) return false;
  if ([state.startedAt, state.lastWarm].some(day => !Number.isFinite(Date.parse(String(day))) || new Date(String(day)).toISOString().slice(0, 10) !== day)) return false;
  const age = daysBetween(String(state.startedAt), String(state.lastWarm));
  if (!Number.isInteger(age) || age < 0 || daysBetween(String(state.lastWarm), today) < 0 || daysBetween(String(state.startedAt), today) > 3650) return false;
  return ["streak", "qi", "burns", "totalWarmed"].every(key => Number.isSafeInteger(state[key]) && Number(state[key]) >= 0 && Number(state[key]) <= 1000000)
    && Number(state.streak) <= age + 1 && Number(state.qi) <= Number(state.totalWarmed) && Number(state.streak) <= Number(state.totalWarmed);
}
export function incubatorMode(state: IncubatorState | null, today = incubatorDay()) {
  if (!state) return { mode: "lay" as const, missedDays: 0 };
  const missedDays = Math.max(0, daysBetween(state.lastWarm, today) - 1);
  return { mode: state.lastWarm === today ? "warmedToday" as const : missedDays >= 7 ? "void" as const : missedDays ? "burned" as const : "ready" as const, missedDays };
}
export function advanceIncubator(state: IncubatorState | null, action: "lay" | "warm", today = incubatorDay()): IncubatorState | null {
  const { mode, missedDays } = incubatorMode(state, today);
  if (action === "lay" && (mode === "lay" || mode === "void")) return { startedAt: today, lastWarm: today, streak: 1, qi: 1, burns: 0, totalWarmed: (state?.totalWarmed ?? 0) + 1 };
  if (action === "warm" && state && (mode === "ready" || mode === "burned")) return { ...state, lastWarm: today, streak: mode === "burned" ? 1 : state.streak + 1, qi: Math.max(1, (mode === "burned" ? state.qi - missedDays * 2 : state.qi) + 1), burns: state.burns + Number(mode === "burned"), totalWarmed: state.totalWarmed + 1 };
  return null;
}

export function incubatorAchievements(state: IncubatorState): string[] {
  const age = daysBetween(state.startedAt, state.lastWarm) + 1;
  return ["incubator.start", ...(age >= 3 ? ["incubator.day3"] : []), ...(age >= 7 ? ["incubator.day7"] : []),
    ...(age >= 14 ? ["incubator.day14"] : []), ...(state.qi >= 30 ? ["incubator.perfect"] : [])];
}
