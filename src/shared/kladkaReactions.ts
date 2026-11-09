export const KLADKA_REACTIONS = [
  { id: "shell", emoji: "🥚", ru: "Крепкая скорлупа", en: "Strong shell" },
  { id: "yolk", emoji: "💛", ru: "В самый желток", en: "Right in the yolk" },
  { id: "hatch", emoji: "🐣", ru: "Вылупился от смеха", en: "Cracking up" },
  { id: "warm", emoji: "🔥", ru: "Греет", en: "Warming" },
  { id: "fry", emoji: "🍳", ru: "Аппетитно", en: "Delicious" },
] as const;

export type KladkaReaction = typeof KLADKA_REACTIONS[number]["id"];
export const KLADKA_REACTION_MAX = 3;
export type KladkaReactionSummary = {
  counts: Partial<Record<KladkaReaction, number>>;
  /** Kept for clients loaded before multiple reactions were introduced. */
  mine: KladkaReaction | null;
  selected: KladkaReaction[];
};
export type KladkaReactionAccess = { reason: "ready" | "login" | "initiation" };
export type KladkaReactionFeed = {
  entries: Record<string, KladkaReactionSummary>;
  access: KladkaReactionAccess;
  account: string | null;
};
export const isKladkaReaction = (value: unknown): value is KladkaReaction => KLADKA_REACTIONS.some(item => item.id === value);
