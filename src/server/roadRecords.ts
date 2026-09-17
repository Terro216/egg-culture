import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PublishedRun, RoadLeaderboard, LeaderboardEntry } from "../features/EggRoad/leaderboard.ts";

type Row = { player: string; name: string; score: number; gates: number; distance: number; seconds: number; finished: number };

export function createRoadRecordStore(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, "records.sqlite"));
  // One small durable database in the existing data volume; no separate WAL to back up.
  db.exec(`PRAGMA busy_timeout = 3000; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS records (
      code TEXT NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL,
      score INTEGER NOT NULL, gates INTEGER NOT NULL, distance REAL NOT NULL,
      seconds REAL NOT NULL, finished INTEGER NOT NULL, created INTEGER NOT NULL,
      PRIMARY KEY (code, player)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS road_ranking ON records(code, score DESC, created, player);
    CREATE INDEX IF NOT EXISTS player_roads ON records(player, code);`);
  const rank = db.prepare("SELECT COUNT(*) + 1 AS rank FROM records WHERE code = ? AND score > ?");
  const view = (code: string, player: string, row: Row): LeaderboardEntry => ({
    rank: Number(rank.get(code, row.score)!.rank), name: row.name, score: row.score,
    gates: row.gates, distance: row.distance, seconds: row.seconds, finished: Boolean(row.finished), mine: row.player === player,
  });
  return {
    read(code: string, player: string): RoadLeaderboard {
      const rows = db.prepare("SELECT * FROM records WHERE code = ? ORDER BY score DESC, created, player LIMIT 20").all(code) as Row[];
      const own = db.prepare("SELECT * FROM records WHERE code = ? AND player = ?").get(code, player) as Row | undefined;
      const lastName = db.prepare("SELECT name FROM records WHERE player = ? ORDER BY created DESC LIMIT 1").get(player)?.name;
      return {
        code, entries: rows.map(row => view(code, player, row)), personal: own ? view(code, player, own) : null,
        total: Number(db.prepare("SELECT COUNT(*) AS n FROM records WHERE code = ?").get(code)!.n),
        name: String(lastName ?? `Egg ${player.slice(0, 5).toUpperCase()}`),
        endlessBest: Number(db.prepare("SELECT COALESCE(MAX(score), 0) AS best FROM records WHERE player = ? AND code LIKE 'EGG1-E-%'").get(player)!.best),
      };
    },
    submit(player: string, run: PublishedRun) {
      db.prepare(`INSERT INTO records (code, player, name, score, gates, distance, seconds, finished, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code, player) DO UPDATE SET name = excluded.name, score = excluded.score,
          gates = excluded.gates, distance = excluded.distance, seconds = excluded.seconds,
          finished = excluded.finished, created = excluded.created
        WHERE excluded.score > records.score`).run(
        run.code, player, run.name, run.score, run.gates, run.distance, run.seconds, Number(run.finished), Date.now(),
      );
      return this.read(run.code, player);
    },
    close() { db.close(); },
  };
}

let store: ReturnType<typeof createRoadRecordStore> | undefined;
export function roadRecordStore() {
  return store ??= createRoadRecordStore(resolve(process.env.EGG_ROAD_DATA_DIR ?? join(process.env.KLADKA_DATA_DIR ?? ".kladka", "egg-road")));
}
