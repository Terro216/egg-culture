import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { normalizePlayerName } from "../features/EggRoad/leaderboard.ts";
import type { PublishedRun, RoadLeaderboard, LeaderboardEntry, PopularFilter, PopularRoads } from "../features/EggRoad/leaderboard.ts";

type Row = { player: string; name: string; score: number; gates: number; distance: number; seconds: number; finished: number };
export class RoadNameTakenError extends Error {}

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
    CREATE INDEX IF NOT EXISTS player_roads ON records(player, code);
    CREATE TABLE IF NOT EXISTS players (
      player TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE
    ) STRICT;`);
  const owner = db.prepare("SELECT player FROM players WHERE name_key = ?");
  const availableName = (preferred: string, reserved = new Set<string>()) => {
    let name = preferred;
    for (let n = 2; owner.get(normalizePlayerName(name)!.key) || (name !== preferred && reserved.has(normalizePlayerName(name)!.key)); n++) {
      const suffix = ` ${n}`;
      name = [...preferred].slice(0, 32 - suffix.length).join("").trimEnd() + suffix;
    }
    return normalizePlayerName(name)!;
  };
  // Adopt existing players without losing any runs. Earlier players keep a
  // colliding name; later ones get a suffix. Also handles writes after rollback.
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare(`SELECT player FROM records GROUP BY player ORDER BY MIN(created), player`).all().map(row => {
      const player = String(row.player);
      const last = db.prepare("SELECT name FROM records WHERE player = ? ORDER BY created DESC, code LIMIT 1").get(player)!.name;
      return { player, preferred: normalizePlayerName(last)?.name ?? `Egg ${player.slice(0, 5).toUpperCase()}` };
    });
    const reserved = new Set(previous.map(row => normalizePlayerName(row.preferred)!.key));
    for (const row of previous) {
      const player = String(row.player);
      let name = db.prepare("SELECT name FROM players WHERE player = ?").get(player)?.name;
      if (!name) {
        const identity = availableName(row.preferred, reserved);
        db.prepare("INSERT INTO players (player, name, name_key) VALUES (?, ?, ?)").run(player, identity.name, identity.key);
        name = identity.name;
      }
      db.prepare("UPDATE records SET name = ? WHERE player = ? AND name != ?").run(name, player, name);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  const rank = db.prepare("SELECT COUNT(*) + 1 AS rank FROM records WHERE code = ? AND score > ?");
  const view = (code: string, player: string, row: Row): LeaderboardEntry => ({
    rank: Number(rank.get(code, row.score)!.rank), name: row.name, score: row.score,
    gates: row.gates, distance: row.distance, seconds: row.seconds, finished: Boolean(row.finished), mine: row.player === player,
  });
  return {
    read(code: string, player: string): RoadLeaderboard {
      const rows = db.prepare("SELECT * FROM records WHERE code = ? ORDER BY score DESC, created, player LIMIT 20").all(code) as Row[];
      const own = db.prepare("SELECT * FROM records WHERE code = ? AND player = ?").get(code, player) as Row | undefined;
      const profile = db.prepare("SELECT name FROM players WHERE player = ?").get(player);
      return {
        code, entries: rows.map(row => view(code, player, row)), personal: own ? view(code, player, own) : null,
        total: Number(db.prepare("SELECT COUNT(*) AS n FROM records WHERE code = ?").get(code)!.n),
        name: String(profile?.name ?? availableName(`Egg ${player.slice(0, 5).toUpperCase()}`).name), nameClaimed: Boolean(profile),
        endlessBest: Number(db.prepare("SELECT COALESCE(MAX(score), 0) AS best FROM records WHERE player = ? AND code LIKE 'EGG1-E-%'").get(player)!.best),
      };
    },
    popular(filter: PopularFilter = "all"): PopularRoads {
      const pattern = filter === "endless" ? "EGG1-E-%" : filter === "finite" ? "EGG1-R-%" : "EGG1-%";
      const rows = db.prepare(`SELECT code, COUNT(*) AS players, MAX(score) AS bestScore FROM records
        WHERE code LIKE ? GROUP BY code ORDER BY players DESC, MAX(created) DESC, code LIMIT 20`).all(pattern);
      return { filter, tracks: rows.map(row => ({ code: String(row.code), players: Number(row.players), bestScore: Number(row.bestScore) })) };
    },
    submit(player: string, run: PublishedRun) {
      const identity = normalizePlayerName(run.name);
      if (!identity) throw new TypeError("Invalid player name");
      // The claim and the score are one transaction, including between workers.
      db.exec("BEGIN IMMEDIATE");
      try {
        const occupied = owner.get(identity.key);
        if (occupied && occupied.player !== player) throw new RoadNameTakenError("Name already taken");
        db.prepare(`INSERT INTO players (player, name, name_key) VALUES (?, ?, ?)
          ON CONFLICT(player) DO UPDATE SET name = excluded.name, name_key = excluded.name_key`).run(player, identity.name, identity.key);
        db.prepare("UPDATE records SET name = ? WHERE player = ? AND name != ?").run(identity.name, player, identity.name);
        db.prepare(`INSERT INTO records (code, player, name, score, gates, distance, seconds, finished, created)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code, player) DO UPDATE SET name = excluded.name, score = excluded.score,
            gates = excluded.gates, distance = excluded.distance, seconds = excluded.seconds,
            finished = excluded.finished, created = excluded.created
          WHERE excluded.score > records.score`).run(
          run.code, player, identity.name, run.score, run.gates, run.distance, run.seconds, Number(run.finished), Date.now(),
        );
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return this.read(run.code, player);
    },
    close() { db.close(); },
  };
}

let store: ReturnType<typeof createRoadRecordStore> | undefined;
export function roadRecordStore() {
  return store ??= createRoadRecordStore(resolve(process.env.EGG_ROAD_DATA_DIR ?? join(process.env.KLADKA_DATA_DIR ?? ".kladka", "egg-road")));
}
