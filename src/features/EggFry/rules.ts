export type FryLang = "ru" | "en";
export const FRY_SEASON = 3;
export type Operation = { kind: "add" | "subtract" | "multiply" | "divide" | "percent" | "keep"; value: bigint; power?: 2 | 3; unit?: bigint; divisor?: bigint; notation?: "fraction" | "decimal" };
export const STARTING_EGGS = 10n;
export const FLOCK_LIMIT = 160;
export const VISIBLE_FLOCK_LIMIT = 1200;
export const PAN_LIMIT = 480;
export const FRAGMENT_LIMIT = 192;
export const ROAD_HALF_WIDTH = 5.5;
export const STEERING_LIMIT = 5.8;
export const STEP = 1 / 60;
export const FRY_SECONDS = 6;
export const CARTON_HALF_WIDTH = 1.4;
export const CARTON_HALF_DEPTH = 2.65;
export const CARTON_Z = -0.7;
export const COLLECTION_STEP = 5;
export const MAX_COLLECTION_MULTIPLIER = 6;
export function collectionMultiplier(points: number) { return Math.min(MAX_COLLECTION_MULTIPLIER, 1 + Math.floor(Math.max(0, points) / COLLECTION_STEP)); }

export function operationValue(operation: Operation) { return operation.value ** BigInt(operation.power ?? 1) * (operation.unit ?? 1n); }
export function isLargeMultiplier(operation: Operation, threshold = 10n) {
  return operation.kind === "multiply" && operationValue(operation) >= threshold * (operation.divisor && operation.divisor > 0n ? operation.divisor : 1n);
}
/** Colour names the operation, not its benefit: late fractions deliberately break the shortcut. */
export function operationTone(operation: Operation): "green" | "red" | "gold" {
  return isLargeMultiplier(operation) ? "gold" : operation.kind === "add" || operation.kind === "multiply" ? "green" : "red";
}
export function applyOperation(count: bigint, operation: Operation): bigint {
  if (count <= 0n || operation.value < 0n) return count > 0n ? count : 0n;
  const value = operationValue(operation);
  // A positive share of a living clutch always leaves one egg. Only an explicit
  // zero / 100% withdrawal / sufficiently large subtraction can erase it.
  const share = (numerator: bigint, denominator: bigint) => numerator > 0n ? (numerator / denominator || 1n) : 0n;
  switch (operation.kind) {
    case "add": return count + value;
    case "subtract": return count > value ? count - value : 0n;
    case "multiply": return share(count * value, operation.divisor && operation.divisor > 0n ? operation.divisor : 1n);
    case "divide": return value > 0n ? share(count * (operation.divisor && operation.divisor > 0n ? operation.divisor : 1n), value) : count;
    case "percent": return share(count * (value < 100n ? 100n - value : 0n), 100n);
    case "keep": return share(count * (value < 100n ? value : 100n), 100n);
  }
}

export function compactCount(count: bigint, lang: FryLang = "ru"): string {
  const value = count < 0n ? -count : count;
  const sign = count < 0n ? "−" : "";
  if (value < 10_000n) return sign + value.toLocaleString(lang);
  const digits = value.toString();
  const power = Math.floor((digits.length - 1) / 3);
  const suffixes = lang === "ru" ? ["", "тыс.", "млн", "млрд", "трлн"] : ["", "K", "M", "B", "T"];
  if (power >= suffixes.length) return `${sign}${digits[0]}${lang === "ru" ? "," : "."}${digits.slice(1, 3)} × 10^${digits.length - 1}`;
  const divisor = 10n ** BigInt(power * 3);
  const whole = value / divisor;
  const decimal = value * 10n / divisor % 10n;
  return `${sign}${whole}${decimal ? `${lang === "ru" ? "," : "."}${decimal}` : ""}${lang === "ru" ? " " : ""}${suffixes[power]}`;
}

export function operationLabel(operation: Operation, lang: FryLang = "ru"): string {
  const number = compactCount(operation.value, lang) + (operation.power === 2 ? "²" : operation.power === 3 ? "³" : "");
  const unit = operation.unit && operation.unit > 1n ? ` × ${compactCount(operation.unit, lang)}` : "";
  const prefix = { add: "+", subtract: "−", multiply: "×", divide: "÷", percent: "−", keep: lang === "ru" ? "Ост. " : "Keep " }[operation.kind];
  if ((operation.kind === "divide" || operation.kind === "multiply") && operation.divisor && operation.divisor > 0n && (operation.notation || operation.kind === "divide")) {
    const value = operationValue(operation), divisor = operation.divisor;
    if (operation.notation === "decimal" && value * 1000n % divisor === 0n) {
      const fraction = (value * 1000n / divisor % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
      return `${prefix}(${value / divisor}${fraction ? `${lang === "ru" ? "," : "."}${fraction}` : ""})`;
    }
    return `${prefix}(${number}${unit}/${divisor})`;
  }
  return prefix + number + unit + (["percent", "keep"].includes(operation.kind) ? "%" : "") + (operation.divisor ? ` ÷ ${operation.divisor}` : "");
}

export function flockSize(count: bigint): number { return Number(count > BigInt(FLOCK_LIMIT) ? BigInt(FLOCK_LIMIT) : count > 0n ? count : 0n); }

/** One deterministic formation is used by both Rapier and the renderer. */
export function flockPoint(index: number, _size: number) {
  if (index < 3) return { x: index === 0 ? 0 : index === 1 ? -0.47 : 0.47, z: -3.2 + (index === 0 ? 0 : 0.18) };
  // Stable slots: a pickup extends the tail instead of widening the old rows.
  const frontColumns = 5;
  let row = 0, column = index - 3, columns = frontColumns;
  while (column >= columns) { column -= columns; row++; columns = Math.min(9, frontColumns + Math.floor(row / 2)); }
  return {
    x: (column - (columns - 1) / 2) * 0.46 + (row % 2 ? 0.11 : -0.11),
    z: -2.55 + row * 0.56,
  };
}

/** All weighted representatives fit inside the same visible box, in a small pile. */
export function cartonPoint(index: number) {
  if (index === 0) return { x: 0, y: 0.48, z: -3.02 };
  const slot = index - 1, layer = Math.floor(slot / 45), cell = slot % 45;
  return { x: (cell % 5 - 2) * 0.45, y: 0.48 + layer * 0.42 + (cell % 2) * 0.025,
    z: -2.55 + Math.floor(cell / 5) * 0.48 };
}

export function visibleFlockSize(count: bigint): number {
  if (count <= BigInt(FLOCK_LIMIT)) return flockSize(count);
  // The extra rows extend beyond the camera; draw calls stay constant even at billions.
  return Math.min(VISIBLE_FLOCK_LIMIT, 160 + Math.floor(Math.max(0, logCount(count) - Math.log10(160)) * 175));
}

export function logCount(count: bigint) { const s = (count > 0n ? count : 1n).toString(); return s.length - 1 + Math.log10(Number(s.slice(0, 12)) / 10 ** (Math.min(12, s.length) - 1)); }
export function panDropCount(count: bigint) { return count <= 180n ? flockSizeUnbounded(count) : Math.min(PAN_LIMIT, 180 + Math.floor((logCount(count) - Math.log10(180)) * 80)); }
function flockSizeUnbounded(count: bigint) { return Number(count > 0n ? count : 0n); }
export function panFill(count: bigint) { return count <= 0n ? 0 : Math.min(1, 0.04 + Math.max(0, logCount(count)) ** 2 / 42); }
export function panSpread(count: bigint) { return 0.10 + Math.sqrt(panFill(count)) * 0.88; }
export function panMarkSize(count: bigint) { return 0.16 + 0.40 * panFill(count); }

export function tailPoint(index: number) {
  const row = Math.floor((index - FLOCK_LIMIT) / 15), column = (index - FLOCK_LIMIT) % 15;
  return { x: (column - 7) * (0.46 + Math.min(1, row / 9) * 0.16), z: 10.2 + row * 0.51 };
}

/** Integer weights sum exactly to the full count, including the remainder. */
export function slotWeight(count: bigint, size: number, index: number): bigint {
  if (!size || index < 0 || index >= size) return 0n;
  const slots = BigInt(size);
  return count / slots + (BigInt(index) < count % slots ? 1n : 0n);
}

export function damageForSlots(count: bigint, size: number, indices: readonly number[]): bigint {
  let loss = 0n;
  for (const index of new Set(indices)) loss += slotWeight(count, size, index);
  return loss > count ? count : loss;
}

export function clampSteering(value: number): number {
  return Number.isFinite(value) ? Math.max(-STEERING_LIMIT, Math.min(STEERING_LIMIT, value)) : 0;
}

export function newFrySeed(): number { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }
export function fryCode(seed: number): string { return `FRY3-${(seed >>> 0).toString(36).toUpperCase()}`; }
export function parseFryCode(value: string | null): number | null {
  const match = value?.match(/^FRY[123]-([0-9A-Z]{1,7})$/i);
  if (!match) return null;
  const seed = parseInt(match[1], 36);
  return seed <= 0xffffffff ? seed : null;
}
