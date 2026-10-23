export type Lang = "ru" | "en";
export type Words = { ru: string; en: string };
export const words = (ru: string, en: string): Words => ({ ru, en });
export type Tool = "inspect" | "scale" | "light" | "plate" | "archive";
export type Reason = "none" | "mass" | "shell" | "age" | "seal" | "origin" | "profile" | "permit" | "procedure";
export type Decision = "admit" | "reject" | "hold" | "guarantee";
export type Person = "vera" | "asya" | "arkady" | "nina" | "semyon" | "ratin";
export type Proof = "source1" | "source2" | "source3" | "standard1" | "standard2" | "standard3" | "pressure1" | "pressure2" | "pressure3";
export type Claim = "source" | "standard" | "pressure";
export type Ending = "approved" | "open" | "free" | "private" | "dismissed";
export type Phase = "brief" | "desk" | "report" | "evening" | "final" | "ended";
export type Style = "blanc" | "bouillon" | "pastoral" | "aged";
export type GameCase = {
  id: string; lot: string; day: number; title: Words; person: Person; line: Words;
  reply: Words; note: Words; registry: Words; profile: Words;
  mass: number; declaredMass: number; colour: "ivory" | "brown" | "speckled";
  style: Style; defect: Reason; suspect: boolean; mandatory: Tool[];
  proofs: { id: Proof; tool: Tool }[]; political: boolean; returned: boolean;
  preserved?: Tool[];
  preservedFindings?: Partial<Record<Tool, Finding>>;
};
export type Receipt = {
  item: GameCase; decision: Decision; reason: Reason; observed: Tool[];
  correct: boolean; factual: boolean; procedural: boolean; supported: boolean;
  political: boolean; intentional: boolean; score: number;
  findings?: Partial<Record<Tool, Finding>>;
};
export type HeldCase = { item: GameCase; observed: Tool[]; findings?: Partial<Record<Tool, Finding>> };
export type Finding = { answer: Reason; valid: boolean; sample?: number; record?: string };
export type Examination = { tool: Tool; answer: Reason; sample: number; record: string };
export type DayReport = {
  day: number; receipts: Receipt[]; correct: number; errors: number; quota: number;
  income: number; sanction: boolean; political: boolean; appealed: boolean;
  timeLeft: number; skipped: number;
};
export type State = {
  version: 1; seed: string; mode: "campaign" | "daily"; date: string;
  phase: Phase; day: number; time: number; budget: number; strikes: number;
  queue: GameCase[]; index: number; observed: Tool[]; receipt: Receipt | null;
  prepared: Tool[]; findings: Partial<Record<Tool, Finding>>;
  receipts: Receipt[]; held: HeldCase[]; guaranteeUsed: boolean;
  reports: DayReport[]; proofs: Proof[]; claims: Claim[];
  relations: Record<Person, number>; solidarity: number; influence: number;
  integrity: number; eventChoice: number | null; purchases: string[];
  ending: Ending | null; achievements: string[]; score: number;
};
export type Action =
  | { type: "start" }
  | { type: "tool"; tool: Tool }
  | { type: "prepare"; tool: Tool }
  | ({ type: "examine" } & Examination)
  | { type: "connect"; claim: Claim; exhibits: Proof[] }
  | { type: "decide"; decision: Decision; reason: Reason }
  | { type: "next" }
  | { type: "close" }
  | { type: "appeal" }
  | { type: "evening" }
  | { type: "choice"; option: number }
  | { type: "buy"; item: "time" | "copy" | "recovery" }
  | { type: "file"; claim: Claim }
  | { type: "advance" }
  | { type: "end"; ending: Exclude<Ending, "dismissed"> };
export type Run = { version: 1; id: string; seed: string; mode: "campaign" | "daily"; date: string; actions: Action[] };
export type EventOption = { label: Words; effect: Words; budget?: number; solidarity?: number; influence?: number; integrity?: number; relations?: Partial<Record<Person, number>>; proof?: Proof };
export type Shift = { title: Words; letter: Words; rule: Words; event: Words; options: EventOption[] };
