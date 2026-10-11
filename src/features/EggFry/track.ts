import { ROAD_HALF_WIDTH } from "./rules.ts";
import type { Operation } from "./rules.ts";

type BaseRow = { id: string; at: number; sector: number };
export type HazardKind = "spatula" | "whisk" | "gap";
export type GateRecipe = "starter" | "reward" | "tax" | "risk" | "jackpot" | "riddle";
export type MysteryEffect = { kind: "operation"; operation: Operation } | { kind: "shield" | "cancel" | "brake" };
export type MysteryGate = { salt: number; revealed?: MysteryEffect };
export type FryRow = BaseRow & (
  | { kind: "gate"; operations: [Operation, Operation]; jackpot: boolean; swap?: boolean; recipe?: GateRecipe; salt?: number; reference?: bigint; swapStartedAt?: number; cancelled?: boolean; mystery?: MysteryGate }
  | { kind: "pickup"; x: number; count: bigint; adaptive?: boolean; reference?: bigint; baseCount?: bigint; multiplier?: number }
  | { kind: "shield"; x: number }
  | { kind: "power"; x: number; power: "cancel" | "brake" }
  | { kind: "modifier"; effect: "invert" }
  | { kind: "hazard"; hazard: HazardKind; x: number; variant: number }
  | { kind: "exit" }
);
export type HazardRow = Extract<FryRow, { kind: "hazard" }>;
export type GateRow = Extract<FryRow, { kind: "gate" }>;
export const LATE_GATES_FROM = 5;
export const MYSTERY_HALF_WIDTH = ROAD_HALF_WIDTH / 3;
export function gateChoice(row: GateRow, x: number, side: 0 | 1): 0 | 1 | "mystery" {
  return row.mystery ? Math.abs(x) < MYSTERY_HALF_WIDTH ? "mystery" : x < 0 ? 0 : 1 : side;
}
/** Fixed per seeded road, never rerolled by rendering, pause, speed or retry. */
export function mysteryEffect(salt: number): MysteryEffect {
  const pool: MysteryEffect[] = [
    { kind: "operation", operation: { kind: "multiply", value: 3n, divisor: 2n } },
    { kind: "operation", operation: { kind: "multiply", value: 3n, divisor: 2n } },
    { kind: "operation", operation: { kind: "multiply", value: 2n } },
    { kind: "operation", operation: { kind: "multiply", value: 3n } },
    { kind: "operation", operation: { kind: "divide", value: 2n } },
    { kind: "operation", operation: { kind: "divide", value: 2n } },
    { kind: "operation", operation: { kind: "percent", value: 25n } },
    { kind: "shield" }, { kind: "cancel" }, { kind: "brake" },
  ];
  return pool[Math.floor(randomSource(salt)() * pool.length)];
}
export const FIRST_SECTOR_LENGTH = 352;
export const SECTOR_LENGTH = 336;
export const SCENES = [["spatula", "gap"], ["gap", "whisk"], ["whisk", "spatula"], ["spatula", "whisk"], ["whisk", "gap"], ["gap", "gap"]] as const;
export function sectorStart(sector: number) { return sector === 0 ? 0 : FIRST_SECTOR_LENGTH + (sector - 1) * SECTOR_LENGTH; }
export function sectorEnd(sector: number) { return sectorStart(sector) + (sector === 0 ? FIRST_SECTOR_LENGTH : SECTOR_LENGTH); }
export function sectorAt(distance: number) { return distance < FIRST_SECTOR_LENGTH ? 0 : 1 + Math.floor((distance - FIRST_SECTOR_LENGTH) / SECTOR_LENGTH); }
export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let v = Math.imul(state ^ state >>> 15, 1 | state); v ^= v + Math.imul(v ^ v >>> 7, 61 | v); return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}
export function roundedAmount(count: bigint, percent: number, up = false): bigint {
  const raw = (count * BigInt(percent) + (up ? 99n : 0n)) / 100n;
  const unit = 10n ** BigInt(Math.max(0, raw.toString().length - 2));
  const result = (raw + (up ? unit - 1n : 0n)) / unit * unit;
  return result > 0n ? result : 1n;
}
function squared(operation: Operation): Operation {
  if (!["add", "subtract"].includes(operation.kind) || operation.value < 9n) return operation;
  const unit = 10n ** BigInt(Math.max(0, operation.value.toString().length - 2));
  const base = BigInt(Math.ceil(Math.sqrt(Number((operation.value + unit - 1n) / unit))));
  return { kind: operation.kind, value: base, power: 2, unit };
}

/** Bind the NEXT board once, before its decision window. Displayed amounts never chase the player. */
export function bindGate(row: GateRow, count: bigint) {
  if (!row.recipe || row.reference !== undefined) return;
  const random = randomSource(row.salt ?? 0), recipe = row.recipe;
  let a: Operation, b: Operation;
  const multiply = random() < 0.7 ? 2n : 3n, more = random() < 0.5;
  if (recipe === "starter") { a = { kind: "add", value: 12n }; b = { kind: "subtract", value: 8n }; }
  else if (recipe === "riddle") {
    const fraction = (value: bigint, divisor: bigint): Operation => ({ kind: "divide", value, divisor, notation: "fraction" });
    const decimal = (value: bigint): Operation => ({ kind: "multiply", value, divisor: 10n, notation: "decimal" });
    const pairs: [Operation, Operation][] = [
      [fraction(2n, 4n), decimal(8n)], [fraction(3n, 4n), decimal(16n)],
      [fraction(4n, 5n), decimal(6n)], [fraction(3n, 2n), decimal(12n)],
      [fraction(2n, 4n), decimal(14n)],
    ];
    [a, b] = pairs[Math.floor(random() * pairs.length)];
  } else if (recipe === "tax") {
    const pairs: [Operation, Operation][] = [
      [{ kind: "divide", value: 2n }, { kind: "keep", value: 4n }],
      [{ kind: "percent", value: 25n }, { kind: "divide", value: 4n }],
      [{ kind: "percent", value: 15n }, { kind: "keep", value: 35n }],
      [{ kind: "keep", value: 80n }, { kind: "percent", value: 70n }],
      [{ kind: "percent", value: 35n }, { kind: "keep", value: 15n }],
    ];
    [a, b] = pairs[Math.floor(random() * pairs.length)];
  } else if (recipe === "risk") {
    a = { kind: "subtract", value: roundedAmount(count, 125 + Math.floor(random() * 4) * 15, true) };
    b = random() < 0.5 ? { kind: "add", value: roundedAmount(count, 70) } : { kind: "multiply", value: 3n, divisor: 2n };
  } else if (recipe === "jackpot") {
    a = { kind: "multiply", value: 20n };
    b = { kind: "add", value: roundedAmount(count, more ? 2400 : 1200) };
  } else {
    a = { kind: "multiply", value: multiply };
    b = { kind: "add", value: roundedAmount(count, multiply === 2n ? more ? 160 : 60 : more ? 300 : 140) };
  }
  if (row.sector >= 3 && random() < 0.75) {
    if (recipe === "reward") {
      a = random() < 0.5 ? { kind: "multiply", value: 5n, divisor: 3n } : { kind: "multiply", value: 7n, divisor: 4n };
      b = squared({ kind: "add", value: roundedAmount(count, more ? 125 : 35) });
    } else if (recipe === "risk") a = squared(a);
    else if (recipe === "tax") {
      if (a.kind === "percent" && a.value === 25n) a = { kind: "percent", value: 5n, power: 2 };
      if (b.kind === "divide" && b.value === 4n) b = { kind: "divide", value: 2n, power: 2 };
    }
  }
  row.operations = recipe === "starter" || random() < 0.5 ? [a, b] : [b, a];
  row.reference = count;
}

/** Topology and recipes are seeded; the arithmetic is frozen later against the actual clutch. */
export function makeSector(seed: number, sector: number): FryRow[] {
  const random = randomSource(seed ^ Math.imul(sector + 1, 0x9e3779b9));
  const scene = SCENES[sector === 0 ? 0 : Math.floor(random() * SCENES.length)];
  const side = () => random() < 0.5 ? -2.65 : 2.65;
  const rows: FryRow[] = [], start = sectorStart(sector), fork = hasFork(seed, sector);
  const base = (slot: number): BaseRow => ({ id: sector + ":" + slot, at: start + 32 + slot * 32, sector });
  const gate = (slot: number, recipe: GateRecipe) => rows.push({ ...base(slot), kind: "gate", recipe, salt: Math.floor(random() * 0xffffffff), operations: [{ kind: "add", value: 0n }, { kind: "add", value: 0n }], jackpot: recipe === "jackpot", swap: recipe !== "starter" && random() < Math.min(0.65, 0.22 + sector * 0.065) });
  gate(0, sector === 0 ? "starter" : sector >= 2 && random() < 0.35 ? "risk" : "reward");
  rows.push({ ...base(1), kind: "pickup", count: 8n, adaptive: true, x: side() });
  gate(2, sector >= 4 && !fork && random() < 0.18 ? "tax" : "reward");
  if (fork) rows.push({ ...base(3), kind: "pickup", count: 8n, adaptive: true, x: side() });
  else rows.push({ ...base(3), kind: "hazard", hazard: scene[0], x: side(), variant: random() * Math.PI * 2 });
  if (sector > 0 && random() < 0.5) rows.push({ ...base(4), kind: "shield", x: side() });
  else rows.push({ ...base(4), kind: "power", power: sector === 0 || random() < 0.6 ? "cancel" : "brake", x: side() });
  gate(5, "tax");
  if (fork) rows.push({ ...base(6), kind: "pickup", count: 8n, adaptive: true, x: side() });
  else rows.push({ ...base(6), kind: "hazard", hazard: scene[1], x: side(), variant: random() * Math.PI * 2 });
  if (sector >= 2 && !fork && random() < 0.5) rows.push({ ...base(7), kind: "hazard", hazard: SCENES[sector % SCENES.length][0], x: side(), variant: random() * Math.PI * 2 });
  else rows.push({ ...base(7), kind: "pickup", count: 8n, adaptive: true, x: side() });
  gate(8, fork ? "tax" : sector >= 5 && random() < 0.08 ? "jackpot" : sector >= 2 ? "risk" : "reward");
  // Separate randomness preserves every opening road and the existing hazard layout.
  if (sector >= LATE_GATES_FROM && !fork) {
    const late = randomSource(seed ^ Math.imul(sector + 1, 0x85ebca6b));
    const middle = rows.find(row => row.id === `${sector}:2`) as GateRow;
    if (middle.recipe === "reward" && late() < 0.45) middle.recipe = "riddle";
    const last = rows.find(row => row.id === `${sector}:8`) as GateRow;
    if (late() < 0.2 && last.recipe !== "jackpot") {
      last.recipe = "riddle"; last.swap = false;
      last.mystery = { salt: Math.floor(late() * 0xffffffff) };
    }
  }
  if (sector >= 3 && !hasFork(seed, sector) && (seed + sector) % 3 === 0) rows.push({ id: sector + ":invert", at: start + 48, sector, kind: "modifier", effect: "invert" });
  rows.push({ id: sector + ":exit", kind: "exit", at: sectorEnd(sector), sector });
  return rows.sort((a, b) => a.at - b.at);
}

export function hasFork(seed: number, sector: number) { return sector >= 4 && (sector + seed % 3) % 3 === 1; }
export function forkGap(seed: number, distance: number) {
  const sector = sectorAt(distance), local = distance - sectorStart(sector);
  if (!hasFork(seed, sector)) return 0;
  // Every gate has at least 56 m of full-width crossing before it. The isolated
  // branches contain pickups, never a moving tool or an unavoidable lethal gate.
  for (const [from, to] of [[112, 136], [204, 232]]) if (local > from && local < to) {
    return 1.2 * Math.min(1, (local - from) / 6, (to - local) / 6);
  }
  return 0;
}
export type RoadInterval = [number, number];
export function roadIntervals(seed: number, distance: number): RoadInterval[] {
  const gap = forkGap(seed, distance);
  return gap > 0 ? [[-ROAD_HALF_WIDTH, -gap / 2], [gap / 2, ROAD_HALF_WIDTH]] : [[-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH]];
}
export function supportedCenter(seed: number, distance: number, desired: number, previous: number, inset: number) {
  const intervals = roadIntervals(seed, distance);
  const lane = intervals.find(([a, b]) => previous >= a && previous <= b)
    ?? intervals.reduce((best, current) => Math.abs((current[0] + current[1]) / 2 - previous) < Math.abs((best[0] + best[1]) / 2 - previous) ? current : best);
  return Math.max(lane[0] + inset, Math.min(lane[1] - inset, desired));
}
export function subtractInterval(intervals: RoadInterval[], from: number, to: number): RoadInterval[] {
  return intervals.flatMap(([a, b]) => to <= a || from >= b ? [[a, b] as RoadInterval] : [...(from > a ? [[a, Math.min(b, from)] as RoadInterval] : []), ...(to < b ? [[Math.max(a, to), b] as RoadInterval] : [])]);
}
export function hazardFootprint(row: HazardRow, _relativeDistance: number, seconds = 0) {
  const difficulty = Math.min(10, row.sector);
  const wave = Math.sin(seconds * (0.8 + difficulty * 0.055) + row.variant);
  const amplitude = row.sector === 0 ? 0.7 : Math.min(3.4, 2.7 + difficulty * 0.08);
  return {
    x: row.hazard === "gap" ? row.x * 0.7 : (row.sector === 0 ? row.x : row.x * 0.12) + wave * amplitude,
    halfWidth: row.hazard === "gap" ? 1.1 + (Math.sin(seconds * (1.05 + difficulty * 0.05) + row.variant) + 1) / 2 * (row.sector === 0 ? 1.25 : 1.8) : row.hazard === "whisk" ? 1.35 : 1.45,
    halfDepth: 3.2,
  };
}
export const SWAP_SECONDS = 0.5;
export function gateSwapProgress(row: GateRow, _ahead: number, _speed: number, seconds?: number) {
  if (!row.swap || row.swapStartedAt === undefined || seconds === undefined) return 0;
  // Linear time, not a moving distance/speed ratio: no stall or reversal at the apex.
  return Math.max(0, Math.min(1, (seconds - row.swapStartedAt) / SWAP_SECONDS));
}
export function gateOperations(row: GateRow): [Operation, Operation] { return row.swap ? [row.operations[1], row.operations[0]] : row.operations; }
export function runningSpeed(sector: number, untilExit: number, peak = 10n) {
  const length = sector === 0 ? FIRST_SECTOR_LENGTH : SECTOR_LENGTH;
  const progress = sector + Math.max(0, 1 - untilExit / length);
  const speed = Math.min(34, 9.5 * (1 + progress * 0.135) + Math.max(0, peak.toString().length - 3) * 0.45);
  return speed * (untilExit < 8 ? 1 - (1 - Math.max(0, untilExit) / 8) * 0.2 : 1);
}
