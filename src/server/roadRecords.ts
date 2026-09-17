import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { normalizePlayerName } from "../features/EggRoad/leaderboard.ts";
import type { PublishedRun, RoadLeaderboard, LeaderboardEntry, PopularFilter, PopularRoads, RoadAccount } from "../features/EggRoad/leaderboard.ts";

type Row = { player: string; name: string; score: number; gates: number; distance: number; seconds: number; finished: number };
export class RoadNameTakenError extends Error {}
export class RoadAccountError extends Error {}
export class RoadAccountChangedError extends Error {}
type Credentials = { player: string; password: string; recovery: string };
export const ROAD_SESSION_SECONDS = 60 * 60 * 24 * 30;

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
    ) STRICT;
    CREATE TABLE IF NOT EXISTS accounts (
      player TEXT PRIMARY KEY, guest TEXT NOT NULL UNIQUE, password TEXT NOT NULL, recovery TEXT NOT NULL, created INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, player TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS player_sessions ON sessions(player, created);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS auth_limits (
      key TEXT PRIMARY KEY, until INTEGER NOT NULL, count INTEGER NOT NULL
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
  const registered = (player: string) => Boolean(db.prepare("SELECT 1 FROM accounts WHERE player = ?").get(player));
  const claimName = (player: string, name: string) => {
    const identity = normalizePlayerName(name);
    if (!identity) throw new TypeError("Invalid player name");
    const occupied = owner.get(identity.key);
    if (occupied && occupied.player !== player) throw new RoadNameTakenError("Name already taken");
    db.prepare(`INSERT INTO players (player, name, name_key) VALUES (?, ?, ?)
      ON CONFLICT(player) DO UPDATE SET name = excluded.name, name_key = excluded.name_key`).run(player, identity.name, identity.key);
    db.prepare("UPDATE records SET name = ? WHERE player = ? AND name != ?").run(identity.name, player, identity.name);
    return identity.name;
  };
  const transaction = <T>(work: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const addSession = (player: string, tokenHash: string) => {
    const now = Date.now();
    db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(tokenHash, player, now + ROAD_SESSION_SECONDS * 1000, now);
    db.prepare("DELETE FROM sessions WHERE player = ? AND token NOT IN (SELECT token FROM sessions WHERE player = ? ORDER BY created DESC, rowid DESC LIMIT 10)").run(player, player);
  };
  return {
    registered,
    account(player: string): RoadAccount {
      const name = db.prepare("SELECT name FROM players WHERE player = ?").get(player)?.name;
      return { name: String(name ?? availableName(`Egg ${player.slice(0, 5).toUpperCase()}`).name), registered: registered(player) };
    },
    session(tokenHash: string) {
      const row = db.prepare("SELECT player FROM sessions WHERE token = ? AND expires > ?").get(tokenHash, Date.now());
      return row && registered(String(row.player)) ? String(row.player) : null;
    },
    credentials(name: string): Credentials | null {
      const identity = normalizePlayerName(name);
      if (!identity) return null;
      return db.prepare("SELECT a.player, a.password, a.recovery FROM accounts a JOIN players p ON a.player = p.player WHERE p.name_key = ?").get(identity.key) as Credentials | undefined ?? null;
    },
    register(player: string, name: string, password: string, recovery: string, tokenHash: string) {
      const accountPlayer = randomBytes(32).toString("hex");
      transaction(() => {
        if (registered(player) || db.prepare("SELECT 1 FROM accounts WHERE guest = ?").get(player)) throw new RoadNameTakenError("Already registered");
        claimName(player, name);
        // Retire the guest identity as well as its cookie. Even an older image
        // cannot resolve the old guest token to these protected records.
        db.prepare("UPDATE players SET player = ? WHERE player = ?").run(accountPlayer, player);
        db.prepare("UPDATE records SET player = ? WHERE player = ?").run(accountPlayer, player);
        db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?)").run(accountPlayer, player, password, recovery, Date.now());
        addSession(accountPlayer, tokenHash);
      });
      return this.account(accountPlayer);
    },
    login(credentials: Credentials, tokenHash: string) {
      transaction(() => {
        // A password may have changed while its asynchronous check was running.
        if (db.prepare("SELECT password FROM accounts WHERE player = ?").get(credentials.player)?.password !== credentials.password) throw new RoadAccountError("Credentials changed");
        addSession(credentials.player, tokenHash);
      });
      return this.account(credentials.player);
    },
    resetPassword(credentials: Credentials, password: string, recovery: string, tokenHash: string) {
      transaction(() => {
        const row = db.prepare("SELECT password, recovery FROM accounts WHERE player = ?").get(credentials.player);
        if (row?.password !== credentials.password || row?.recovery !== credentials.recovery) throw new RoadAccountError("Credentials changed");
        db.prepare("UPDATE accounts SET password = ?, recovery = ? WHERE player = ?").run(password, recovery, credentials.player);
        db.prepare("DELETE FROM sessions WHERE player = ?").run(credentials.player);
        addSession(credentials.player, tokenHash);
      });
      return this.account(credentials.player);
    },
    logout(tokenHash: string) { db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash); },
    allowAuth(key: string, maximum: number, windowMs: number) {
      return transaction(() => {
        const now = Date.now();
        db.prepare("DELETE FROM auth_limits WHERE until <= ?").run(now);
        if (Number(db.prepare("SELECT COUNT(*) AS n FROM auth_limits").get()!.n) >= 10000 && !db.prepare("SELECT 1 FROM auth_limits WHERE key = ?").get(key)) return false;
        const row = db.prepare(`INSERT INTO auth_limits VALUES (?, ?, 1)
          ON CONFLICT(key) DO UPDATE SET count = auth_limits.count + 1 RETURNING count`).get(key, now + windowMs)!;
        return Number(row.count) <= maximum;
      });
    },
    read(code: string, player: string): RoadLeaderboard {
      const rows = db.prepare("SELECT * FROM records WHERE code = ? ORDER BY score DESC, created, player LIMIT 20").all(code) as Row[];
      const own = db.prepare("SELECT * FROM records WHERE code = ? AND player = ?").get(code, player) as Row | undefined;
      const profile = db.prepare("SELECT name FROM players WHERE player = ?").get(player);
      return {
        code, entries: rows.map(row => view(code, player, row)), personal: own ? view(code, player, own) : null,
        total: Number(db.prepare("SELECT COUNT(*) AS n FROM records WHERE code = ?").get(code)!.n),
        name: String(profile?.name ?? availableName(`Egg ${player.slice(0, 5).toUpperCase()}`).name), nameClaimed: Boolean(profile), registered: registered(player),
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
      // The claim and the score are one transaction, including between workers.
      transaction(() => {
        // Registered names are login names and cannot change through score submission.
        const name = registered(player) ? this.account(player).name : claimName(player, run.name);
        if (normalizePlayerName(name)?.key !== normalizePlayerName(run.name)?.key) throw new RoadAccountChangedError("Account changed");
        db.prepare(`INSERT INTO records (code, player, name, score, gates, distance, seconds, finished, created)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code, player) DO UPDATE SET name = excluded.name, score = excluded.score,
            gates = excluded.gates, distance = excluded.distance, seconds = excluded.seconds,
            finished = excluded.finished, created = excluded.created
          WHERE excluded.score > records.score`).run(
          run.code, player, name, run.score, run.gates, run.distance, run.seconds, Number(run.finished), Date.now(),
        );
      });
      return this.read(run.code, player);
    },
    close() { db.close(); },
  };
}

let store: ReturnType<typeof createRoadRecordStore> | undefined;
export function roadRecordStore() {
  return store ??= createRoadRecordStore(resolve(process.env.EGG_ROAD_DATA_DIR ?? join(process.env.KLADKA_DATA_DIR ?? ".kladka", "egg-road")));
}
