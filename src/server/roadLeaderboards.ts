import type { DatabaseSync } from "node:sqlite";
import type { LeaderboardEntry, PopularFilter, PopularRoads, RoadLeaderboard } from "../features/EggRoad/leaderboard.ts";

type Row = { player: string; name: string; score: number; gates: number; distance: number; seconds: number; finished: number; profileId: string | null };
/** Read models for public boards, separate from identity and account mutations. */
export function createRoadLeaderboards(db: DatabaseSync, registered: (player: string) => boolean, availableName: (preferred: string) => { name: string }) {
  const selection = `SELECT r.*, COALESCE(p.slug, p.public_id) AS profileId FROM records r
    LEFT JOIN portal_profiles p ON p.player = r.player AND p.public = 1`;
  const top = db.prepare(`${selection} WHERE r.code = ? ORDER BY r.score DESC, r.created, r.player LIMIT 20`);
  const personal = db.prepare(`${selection} WHERE r.code = ? AND r.player = ?`);
  const rank = db.prepare("SELECT COUNT(*) + 1 AS rank FROM records WHERE code = ? AND score > ?");
  const total = db.prepare("SELECT COUNT(*) AS n FROM records WHERE code = ?");
  const name = db.prepare("SELECT name FROM players WHERE player = ?");
  const endless = db.prepare("SELECT COALESCE(MAX(score), 0) AS best FROM records WHERE player = ? AND code LIKE ?");
  const view = (player: string, row: Row, rank: number): LeaderboardEntry => ({
    rank, name: row.name, score: row.score, gates: row.gates, distance: row.distance,
    seconds: row.seconds, finished: Boolean(row.finished), mine: row.player === player,
    ...(row.profileId ? { profileId: row.profileId } : {}),
  });
  return {
    read(code: string, player: string): RoadLeaderboard {
      const rows = top.all(code) as Row[];
      let place = 0;
      const entries = rows.map((row, index) => { if (!index || row.score !== rows[index - 1].score) place = index + 1; return view(player, row, place); });
      let own = entries.find(entry => entry.mine) ?? null;
      if (!own) { const row = personal.get(code, player) as Row | undefined; if (row) own = view(player, row, Number(rank.get(code, row.score)!.rank)); }
      const profile = name.get(player);
      return { code, entries, personal: own, total: Number(total.get(code)!.n),
        name: String(profile?.name ?? availableName(`Egg ${player.slice(0, 5).toUpperCase()}`).name), nameClaimed: Boolean(profile), registered: registered(player),
        endlessBest: Number(endless.get(player, `${code.split("-")[0]}-E-%`)!.best) };
    },
    popular(filter: PopularFilter = "all"): PopularRoads {
      const pattern = filter === "endless" ? "EGG_-E-%" : filter === "finite" ? "EGG_-R-%" : "EGG_-%";
      const rows = db.prepare(`SELECT code, COUNT(*) AS players, MAX(score) AS bestScore FROM records
        WHERE (code LIKE ? OR code LIKE ? OR code LIKE ?) GROUP BY code ORDER BY players DESC, bestScore DESC, MAX(created) DESC, code LIMIT 20`).all(pattern, filter === "finite" ? "EGG_-S-%" : pattern, filter === "finite" ? "EGG_-T-%" : pattern);
      return { filter, tracks: rows.map(row => ({ code: String(row.code), players: Number(row.players), bestScore: Number(row.bestScore) })) };
    },
  };
}
