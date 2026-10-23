import { casesFor, reasonTool } from "./cases.ts";
import { claims, proofs, shifts, tools } from "./content.ts";
import { examinationAnswers, expectedAnswer, validExamination } from "./examination.ts";
import type { Action, Claim, Decision, Ending, GameCase, Proof, Reason, Receipt, Run, State, Tool } from "./types.ts";

export const VERSION = 1;
export const MAX_ACTIONS = 2500;
export const validDate = (value: unknown): value is string => typeof value === "string" && /^20\d\d-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const moscowDay = (now = Date.now()) => new Date(now + 3 * 3600000).toISOString().slice(0, 10);
export const dailySeed = (date: string) => `COMMISSION1-DAILY-${date}`;
export class GameError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
function requireThat(condition: unknown, code: string): asserts condition { if (!condition) throw new GameError(code); }
const addUnique = <T>(list: T[], value: T) => { if (!list.includes(value)) list.push(value); };
const toolIds = Object.keys(tools) as Tool[];
const reasonIds: Reason[] = ["none", "mass", "shell", "age", "seal", "origin", "profile", "permit", "procedure"];
const decisions: Decision[] = ["admit", "reject", "hold", "guarantee"];
const endingIds = ["approved", "open", "free", "private"] as const;
export function workAllowance(queue: GameCase[], extra = 0) {
  return Math.max(24, queue.reduce((sum, item) => sum + item.mandatory.reduce((n, t) => n + tools[t].cost, 0), 0) + 6) + extra;
}
export function initialState(run: Pick<Run, "seed" | "mode" | "date">): State {
  const queue = casesFor(run.seed, 1, run.mode === "daily");
  return { version: 1, seed: run.seed, mode: run.mode, date: run.date, phase: "brief", day: 1, time: workAllowance(queue), budget: 12, strikes: 0,
    queue, index: 0, observed: [], prepared: [], findings: {}, receipt: null, receipts: [], held: [], guaranteeUsed: false, reports: [], proofs: [], claims: [],
    relations: { vera: 0, asya: 0, arkady: 0, nina: 0, semyon: 0, ratin: 0 }, solidarity: 0, influence: 0, integrity: 0,
    eventChoice: null, purchases: [], ending: null, achievements: [], score: 0 };
}
export function currentCase(state: State) { return state.queue[state.index] ?? null; }
export function availableTools(state: State) { return toolIds.filter(id => state.mode === "daily" || tools[id].day <= state.day); }
export function foundViolations(state: State): Reason[] {
  const item = currentCase(state); if (!item || item.defect === "none") return [];
  const t = reasonTool[item.defect];
  const finding = t && state.findings[t];
  return t && state.observed.includes(t) && (!finding || finding.valid && finding.answer === item.defect) ? [item.defect] : [];
}
export function canGuarantee(state: State) { return (state.mode === "daily" || state.day >= 4) && !state.guaranteeUsed; }
export function canHold(state: State) { return state.mode === "campaign" && state.day >= 3 && state.day < 12 && state.held.length < 2 && !currentCase(state)?.returned; }
export function canFile(state: State, id: Claim) { return claims[id].required.filter(p => state.proofs.includes(p)).length >= 2; }
export function availableEndings(state: State): Exclude<Ending, "dismissed">[] {
  const result: Exclude<Ending, "dismissed">[] = ["approved"];
  if (state.claims.length === 3 && state.integrity >= 3 && (state.relations.vera >= 1 || state.relations.nina >= 1 || state.relations.semyon >= 1)) result.push("open");
  if (state.solidarity >= 4 && state.relations.asya >= 2) result.push("free");
  if (state.influence >= 6 && state.relations.arkady >= 2 && state.proofs.length >= 2) result.push("private");
  return result;
}
export const proofAvailableFrom: Record<Proof, number> = { source1: 3, source2: 6, source3: 6, standard1: 4, standard2: 7, standard3: 7, pressure1: 5, pressure2: 8, pressure3: 10 };
export function nextCopy(state: State): Proof | null { return (Object.keys(proofs) as Proof[]).find(id => proofAvailableFrom[id] < state.day && !state.proofs.includes(id)) ?? null; }
export function canAppeal(state: State) {
  const report = state.reports.at(-1);
  return state.phase === "report" && report?.sanction && report.political && report.errors < 2 && !report.appealed && state.proofs.some(p => p.startsWith("pressure")) && state.budget >= 2;
}
function closeShift(s: State) {
  const decided = s.receipts.filter(r => r.decision !== "hold");
  const correct = decided.filter(r => r.correct).length;
  const errors = decided.length - correct;
  const quota = s.mode === "daily" ? s.queue.length : s.day === 1 ? 4 : 5;
  const political = s.mode === "campaign" && decided.some(r => r.political);
  const sanction = s.mode === "campaign" && s.day > 1 && (errors >= 2 || decided.length < quota || political);
  const income = s.mode === "daily" ? 0 : Math.max(0, correct * 2 - errors * 2 - (decided.length < quota ? 2 : 0));
  const skipped = s.queue.length - s.receipts.length;
  s.budget = Math.min(99, s.budget + income);
  if (sanction) s.strikes++;
  s.reports.push({ day: s.day, receipts: structuredClone(s.receipts), correct, errors, quota, income, sanction, political, appealed: false, timeLeft: s.time, skipped });
  s.score += decided.reduce((n, r) => n + r.score, 0) - skipped * 50;
  if (correct >= quota && errors === 0) addUnique(s.achievements, "precise");
  if (s.day === 1 && s.mode === "campaign") addUnique(s.achievements, "first");
  s.phase = "report";
}

export function applyAction(state: State, action: Action): State {
  const s = structuredClone(state);
  requireThat(s.phase !== "ended", "finished");
  switch (action.type) {
    case "start":
      requireThat(s.phase === "brief", "phase"); s.phase = "desk"; break;
    case "tool": {
      requireThat(s.phase === "desk" && !s.receipt, "phase");
      const item = currentCase(s); requireThat(item, "no_case");
      requireThat(availableTools(s).includes(action.tool), "tool_locked");
      requireThat(!s.observed.includes(action.tool), "already_checked");
      requireThat(s.time >= tools[action.tool].cost, "no_time");
      s.time -= tools[action.tool].cost; s.observed.push(action.tool);
      for (const p of item.proofs) if (p.tool === action.tool) addUnique(s.proofs, p.id);
      const used = new Set([...s.reports.flatMap(r => r.receipts.flatMap(c => c.observed)), ...s.receipts.flatMap(r => r.observed), ...s.observed]);
      if (used.size === 5) addUnique(s.achievements, "instruments");
      break;
    }
    case "prepare": {
      requireThat(s.phase === "desk" && !s.receipt && currentCase(s), "phase");
      requireThat(availableTools(s).includes(action.tool), "tool_locked");
      requireThat(!s.prepared.includes(action.tool) && !s.observed.includes(action.tool), "already_checked");
      requireThat(s.time >= tools[action.tool].cost, "no_time");
      s.time -= tools[action.tool].cost; s.prepared.push(action.tool);
      break;
    }
    case "examine": {
      requireThat(s.phase === "desk" && !s.receipt, "phase");
      const item = currentCase(s); requireThat(item, "no_case");
      requireThat(availableTools(s).includes(action.tool), "tool_locked");
      requireThat(action.tool === "inspect" || s.prepared.includes(action.tool), "not_prepared");
      requireThat(!s.observed.includes(action.tool), "already_checked");
      requireThat(examinationAnswers[action.tool].includes(action.answer), "invalid_action");
      requireThat(action.tool !== "inspect" || action.sample === 15, "incomplete_inspection");
      const valid = validExamination(item, action);
      s.observed.push(action.tool); s.findings[action.tool] = { answer: action.answer, valid, sample: action.sample, record: action.record };
      for (const p of item.proofs) if (p.tool === action.tool && valid) addUnique(s.proofs, p.id);
      const used = new Set([...s.reports.flatMap(r => r.receipts.flatMap(c => c.observed)), ...s.receipts.flatMap(r => r.observed), ...s.observed]);
      if (used.size === 5) addUnique(s.achievements, "instruments");
      break;
    }
    case "decide": {
      requireThat(s.phase === "desk" && !s.receipt, "phase");
      const item = currentCase(s); requireThat(item, "no_case");
      requireThat(decisions.includes(action.decision) && reasonIds.includes(action.reason), "invalid_action");
      if (action.decision === "hold") {
        requireThat(canHold(s), "hold_unavailable");
        s.held.push({ item: structuredClone(item), observed: [...s.observed], findings: structuredClone(s.findings) });
        const r: Receipt = { item: structuredClone(item), decision: "hold", reason: "none", observed: [...s.observed], correct: false, factual: true, procedural: true, supported: true, political: false, intentional: false, score: 0 };
        s.receipts.push(r); s.receipt = r; break;
      }
      const complete = item.mandatory.every(t => s.observed.includes(t));
      const discovered = foundViolations(s).includes(item.defect);
      const accurate = item.mandatory.every(t => !s.findings[t] || s.findings[t]!.valid && s.findings[t]!.answer === expectedAnswer(item, t));
      const supported = action.decision === "reject" ? discovered && action.reason === item.defect : complete && accurate;
      let factual = item.defect === "none", procedural = true;
      if (action.decision === "reject") factual = item.defect !== "none" && action.reason === item.defect;
      if (action.decision === "guarantee") {
        requireThat(canGuarantee(s), "guarantee_unavailable");
        s.guaranteeUsed = true;
        factual = item.defect === "permit";
        if (factual && complete && supported) addUnique(s.achievements, "guarantee");
      }
      if (action.decision !== "reject" && !complete) procedural = false;
      if (action.decision === "reject" && !supported) procedural = false;
      const correct = factual && procedural && supported;
      const political = s.mode === "campaign" && item.political && action.decision === "reject" && correct;
      const intentional = discovered && action.decision === "admit";
      const r: Receipt = { item: structuredClone(item), decision: action.decision, reason: action.reason, observed: [...s.observed], findings: structuredClone(s.findings), correct, factual, procedural, supported, political, intentional, score: correct ? 100 : -100 };
      s.receipts.push(r); s.receipt = r;
      if (s.mode === "campaign") {
        if ((action.decision === "admit" && item.defect === "none") || (action.decision === "guarantee" && correct)) s.relations[item.person] = Math.min(9, s.relations[item.person] + 1);
        if (action.decision === "reject" && item.defect === "none") s.relations[item.person] = Math.max(-9, s.relations[item.person] - 1);
        if (intentional && (item.person === "arkady" || item.person === "ratin")) { s.influence++; s.relations[item.person] = Math.min(9, s.relations[item.person] + 1); }
      }
      break;
    }
    case "next":
      requireThat(s.phase === "desk" && s.receipt, "phase");
      s.index++; s.receipt = null; s.observed = [...(currentCase(s)?.preserved ?? [])];
      s.prepared = []; s.findings = structuredClone(currentCase(s)?.preservedFindings ?? {});
      if (s.index >= s.queue.length) closeShift(s);
      break;
    case "close":
      requireThat(s.phase === "desk" && !s.receipt, "phase");
      closeShift(s); break;
    case "appeal": {
      requireThat(canAppeal(s), "appeal_unavailable");
      s.budget -= 2; s.strikes = Math.max(0, s.strikes - 1);
      s.reports[s.reports.length - 1].appealed = true;
      addUnique(s.achievements, "appeal"); break;
    }
    case "evening":
      requireThat(s.phase === "report", "phase");
      if (s.mode === "daily") { addUnique(s.achievements, "daily"); s.phase = "ended"; }
      else if (s.strikes >= 3) { s.ending = "dismissed"; s.phase = "ended"; }
      else s.phase = "evening";
      break;
    case "choice": {
      requireThat(s.phase === "evening" && s.eventChoice === null, "phase");
      const option = shifts[s.day - 1].options[action.option]; requireThat(option, "invalid_action");
      requireThat(s.budget + (option.budget ?? 0) >= 0, "no_budget");
      s.budget = Math.min(99, s.budget + (option.budget ?? 0));
      s.solidarity += option.solidarity ?? 0; s.influence += option.influence ?? 0; s.integrity += option.integrity ?? 0;
      for (const [key, amount] of Object.entries(option.relations ?? {})) { const person = key as keyof typeof s.relations; s.relations[person] = Math.max(-9, Math.min(9, s.relations[person] + amount)); }
      if (option.proof) addUnique(s.proofs, option.proof);
      s.eventChoice = action.option; break;
    }
    case "buy": {
      requireThat(s.phase === "evening" || s.phase === "final", "phase");
      const cost = { time: 3, copy: 4, recovery: 5 }[action.item];
      requireThat(typeof cost === "number", "invalid_action");
      const id = `${s.day}:${action.item}`;
      requireThat(!s.purchases.includes(id), "already_bought");
      requireThat(s.budget >= cost, "no_budget");
      if (action.item === "time") requireThat(s.day < 12, "last_day");
      if (action.item === "recovery") { requireThat(s.strikes > 0, "no_sanction"); s.strikes--; }
      if (action.item === "copy") { const id = nextCopy(s); requireThat(id, "no_copy"); addUnique(s.proofs, id); }
      s.budget -= cost; s.purchases.push(id); break;
    }
    case "connect":
      requireThat(action.exhibits.length === 2 && new Set(action.exhibits).size === 2 && action.exhibits.every(p => s.proofs.includes(p) && claims[action.claim].required.includes(p)), "missing_proof");
      // Legacy 'file' actions remain replayable; the workbench asks the player to select the exhibits.
    case "file":
      requireThat(s.phase === "evening" || s.phase === "final", "phase");
      requireThat(action.claim in claims && canFile(s, action.claim), "missing_proof");
      requireThat(!s.claims.includes(action.claim), "already_filed");
      s.claims.push(action.claim); if (s.claims.length === 3) addUnique(s.achievements, "dossier"); break;
    case "advance": {
      requireThat(s.phase === "evening" && s.eventChoice !== null, "phase");
      if (s.day === 12) { s.phase = "final"; break; }
      const extra = s.purchases.includes(`${s.day}:time`) ? 4 : 0;
      s.day++; s.phase = "brief";
      const returned = s.held.map(({ item, observed, findings }) => {
        const next = structuredClone(item); next.returned = true;
        next.preserved = observed.filter(tool => tool !== "archive");
        if (findings) next.preservedFindings = Object.fromEntries(Object.entries(findings).filter(([tool]) => tool !== "archive"));
        if (next.defect === "permit") { next.defect = "none"; next.registry = { ru: "Продление зарегистрировано. Свидетельство действует. Происхождение и печать подтверждены.", en: "Renewal registered. Certificate valid. Provenance and seal confirmed." }; }
        return next;
      });
      s.queue = [...returned, ...casesFor(s.seed, s.day)];
      s.held = []; s.index = 0; s.observed = [...(s.queue[0]?.preserved ?? [])]; s.receipt = null; s.receipts = []; s.guaranteeUsed = false; s.eventChoice = null;
      s.prepared = []; s.findings = structuredClone(s.queue[0]?.preservedFindings ?? {});
      s.time = workAllowance(s.queue, extra); break;
    }
    case "end":
      requireThat(s.phase === "final" && availableEndings(s).includes(action.ending), "ending_locked");
      s.ending = action.ending; s.phase = "ended"; addUnique(s.achievements, action.ending); break;
    default: throw new GameError("invalid_action");
  }
  return s;
}

/** Only known action fields enter a save; hostile objects cannot assign state. */
export function parseAction(value: unknown): Action | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (["start", "next", "close", "appeal", "evening", "advance"].includes(String(v.type))) return { type: v.type } as Action;
  if (v.type === "tool" && toolIds.includes(v.tool as Tool)) return { type: "tool", tool: v.tool as Tool };
  if (v.type === "prepare" && toolIds.includes(v.tool as Tool)) return { type: "prepare", tool: v.tool as Tool };
  if (v.type === "examine" && toolIds.includes(v.tool as Tool) && examinationAnswers[v.tool as Tool].includes(v.answer as Reason)
    && typeof v.sample === "number" && Number.isFinite(v.sample) && v.sample >= -10 && v.sample <= 150
    && typeof v.record === "string" && v.record.length <= 100) return { type: "examine", tool: v.tool as Tool, answer: v.answer as Reason, sample: v.sample, record: v.record };
  if (v.type === "connect" && ["source", "standard", "pressure"].includes(String(v.claim)) && Array.isArray(v.exhibits) && v.exhibits.length === 2 && v.exhibits.every(p => typeof p === "string" && Object.hasOwn(proofs, p))) return { type: "connect", claim: v.claim as Claim, exhibits: v.exhibits as Proof[] };
  if (v.type === "decide" && decisions.includes(v.decision as Decision) && reasonIds.includes(v.reason as Reason)) return { type: "decide", decision: v.decision as Decision, reason: v.reason as Reason };
  if (v.type === "choice" && Number.isInteger(v.option) && Number(v.option) >= 0 && Number(v.option) <= 1) return { type: "choice", option: Number(v.option) };
  if (v.type === "buy" && ["time", "copy", "recovery"].includes(String(v.item))) return { type: "buy", item: v.item } as Action;
  if (v.type === "file" && ["source", "standard", "pressure"].includes(String(v.claim))) return { type: "file", claim: v.claim as Claim };
  if (v.type === "end" && endingIds.includes(v.ending as typeof endingIds[number])) return { type: "end", ending: v.ending as typeof endingIds[number] };
  return null;
}
export function parseRun(value: unknown): Run | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.id !== "string" || !/^[a-f0-9-]{36}$/.test(v.id) || !validDate(v.date) || !["campaign", "daily"].includes(String(v.mode))) return null;
  if (typeof v.seed !== "string" || (v.mode === "daily" ? v.seed !== dailySeed(v.date) : !/^[a-zA-Z0-9-]{8,80}$/.test(v.seed))) return null;
  if (!Array.isArray(v.actions) || v.actions.length > MAX_ACTIONS) return null;
  const actions = v.actions.map(parseAction); if (actions.some(a => a === null)) return null;
  return { version: 1, id: v.id, seed: v.seed, mode: v.mode as Run["mode"], date: v.date, actions: actions as Action[] };
}
export function replay(run: Run): State { let state = initialState(run); for (const action of run.actions) state = applyAction(state, action); return state; }
export function restoreRun(value: unknown): { run: Run; state: State } | null {
  const run = parseRun(value); if (!run) return null;
  try { return { run, state: replay(run) }; } catch { return null; }
}
export function newRun(mode: Run["mode"], date = moscowDay(), id = crypto.randomUUID()): Run {
  return { version: 1, id, seed: mode === "daily" ? dailySeed(date) : `COMMISSION1-${id}`, mode, date, actions: [] };
}
export function retryShift(run: Run): Run {
  const indexes = run.actions.map((a, i) => a.type === "advance" ? i + 1 : -1).filter(i => i >= 0);
  // The final advance opens the finale; a retry still returns to shift twelve.
  let index = indexes.at(-1) ?? 0;
  if (index && replay({ ...run, actions: run.actions.slice(0, index) }).phase === "final") index = indexes.at(-2) ?? 0;
  return { ...run, id: crypto.randomUUID(), actions: run.actions.slice(0, index) };
}
export function dailyResult(state: State) {
  requireThat(state.mode === "daily" && state.phase === "ended", "unfinished");
  const report = state.reports[0];
  return { date: state.date, score: Math.max(0, state.score), correct: report.correct, errors: report.errors, time: report.timeLeft, total: state.queue.length };
}
