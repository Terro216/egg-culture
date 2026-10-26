import type { PublicProfile } from "./model.ts";

export function achievementFrequency(profile: Pick<PublicProfile, "achievementRarity">, id: string, lang: "ru" | "en"): string | null {
  const ru = lang === "ru", value = profile.achievementRarity?.[id];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  if (value === 0) return ru ? "Пока никто не получил" : "No players have earned it yet";
  const number = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 1 });
  const percentage = value < 1 ? "<1" : value > 99.9 && value < 100 ? ">99" : number.format(value);
  return ru ? `Есть у ${percentage}% игроков` : `Earned by ${percentage}% of players`;
}
