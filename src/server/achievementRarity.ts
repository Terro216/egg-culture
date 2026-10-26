import type { DatabaseSync } from "node:sqlite";
import { ACHIEVEMENTS } from "../features/Portal/model.ts";

type AchievementFrequency = { total: number; counts: Record<string, number>; percentages: Record<string, number> };

export function createAchievementRarity(db: DatabaseSync) {
  let cached: AchievementFrequency | null = null, until = 0, version = -1;
  const copy = (value: AchievementFrequency): AchievementFrequency => ({ total: value.total, counts: { ...value.counts }, percentages: { ...value.percentages } });
  const readStats = (): AchievementFrequency => {
      const currentVersion = Number(db.prepare("PRAGMA data_version").get()!.data_version);
      if (cached && Date.now() < until && version === currentVersion) return copy(cached);
      const total = Number(db.prepare("SELECT COUNT(*) AS n FROM accounts").get()!.n);
      const counts = new Map(db.prepare(`SELECT pa.achievement, COUNT(*) AS n FROM portal_achievements pa
        JOIN accounts a ON a.player = pa.player GROUP BY pa.achievement`).all().map(r => [String(r.achievement), Number(r.n)]));
      for (const [id, minimum] of [["road.first", 1], ["road.thousand", 1000]] as const) {
        counts.set(id, Number(db.prepare(`SELECT COUNT(*) AS n FROM accounts a WHERE
          EXISTS (SELECT 1 FROM portal_achievements pa WHERE pa.player = a.player AND pa.achievement = ?)
          OR EXISTS (SELECT 1 FROM records r WHERE r.player = a.player AND r.score >= ?)`).get(id, minimum)!.n));
      }
      cached = {
        total,
        counts: Object.fromEntries(Object.keys(ACHIEVEMENTS).map(id => [id, counts.get(id) ?? 0])),
        percentages: Object.fromEntries(Object.keys(ACHIEVEMENTS).map(id => [id, total ? Math.round((counts.get(id) ?? 0) / total * 1000) / 10 : 0])),
      };
      until = Date.now() + 30000; version = currentVersion;
      return copy(cached);
  };
  return {
    invalidate() { cached = null; },
    read: () => readStats().percentages,
    readStats,
  };
}
