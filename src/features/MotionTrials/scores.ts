export type MotionScores = Partial<Record<"chalaza" | "oracle", number>>;
export function parseMotionScores(value: unknown): MotionScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>, result: MotionScores = {};
  for (const kind of ["chalaza", "oracle"] as const) {
    const score = source[kind];
    if (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) result[kind] = Math.round(score);
  }
  return result;
}
