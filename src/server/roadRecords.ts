import { createAccountProgress } from "./accountProgress.ts";
import { createAchievementRarity } from "./achievementRarity.ts";
import { createRoadLeaderboards } from "./roadLeaderboards.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { normalizePlayerName } from "../features/EggRoad/leaderboard.ts";
import type { PublishedRun, RoadAccount } from "../features/EggRoad/leaderboard.ts";
import { ACHIEVEMENTS, earnedAchievements, validatePortalRun } from "../features/Portal/model.ts";
import { FRY_SEASON } from "../features/EggFry/rules.ts";
import { FUN_ROAD_CODES } from "../features/EggRoad/funRoads.ts";
import type { OwnProfile, PublicProfile, PortalRun, PortalStat, UntangleProgress, UntanglePuzzleRecord } from "../features/Portal/model.ts";
import { analyzeBoard, generatePuzzle, isCampaignSeed, isDailySeed, isSlotPermutation, LEVEL_COUNT, moscowDay, parseSeed } from "../features/EggUntangle/engine.ts";
import { incubatorAchievements } from "./incubatorRules.ts";
import type { IncubatorState } from "./incubatorRules.ts";

export class RoadNameTakenError extends Error {}
export class RoadAccountError extends Error {}
export class RoadAccountChangedError extends Error {}
export class PortalSlugTakenError extends Error {}
export class PortalSlugInvalidError extends Error {}
export class PortalResultInvalidError extends Error {}
export class PortalGuestClaimedError extends Error {}
export const validPortalSlug = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(value) && !/^[a-f0-9]{24}$/.test(value);
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
    CREATE TABLE IF NOT EXISTS road_completions (
      player TEXT NOT NULL, code TEXT NOT NULL, completed INTEGER NOT NULL,
      PRIMARY KEY (player, code)
    ) STRICT;
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
    ) STRICT;
    CREATE TABLE IF NOT EXISTS portal_profiles (
      player TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, public INTEGER NOT NULL DEFAULT 0,
      avatar INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS portal_stats (
      player TEXT NOT NULL, game TEXT NOT NULL, best TEXT NOT NULL, runs INTEGER NOT NULL,
      PRIMARY KEY(player, game)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS portal_achievements (
      player TEXT NOT NULL, achievement TEXT NOT NULL, PRIMARY KEY(player, achievement)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS portal_submissions (
      player TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(player, id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS untangle_puzzles (
      player TEXT NOT NULL, seed TEXT NOT NULL, level INTEGER NOT NULL, mode TEXT NOT NULL,
      day TEXT, moves INTEGER NOT NULL, seconds REAL NOT NULL, hints INTEGER NOT NULL,
      solves INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, seed)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS untangle_player_day ON untangle_puzzles(player, mode, day);
    CREATE TABLE IF NOT EXISTS untangle_guest_claims (
      id TEXT PRIMARY KEY, player TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS portal_migrations (
      name TEXT PRIMARY KEY, created INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS incubator_states (
      player TEXT PRIMARY KEY, state TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS manifesto_progress (
      player TEXT PRIMARY KEY, elapsed_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL, active INTEGER NOT NULL
    ) STRICT;`);
  if (!db.prepare("PRAGMA table_info(portal_profiles)").all().some(row => row.name === "slug")) db.exec("ALTER TABLE portal_profiles ADD COLUMN slug TEXT");
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS portal_profile_slug ON portal_profiles(slug);
    CREATE TABLE IF NOT EXISTS portal_profile_slug_aliases (
      slug TEXT PRIMARY KEY, player TEXT NOT NULL
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
    const migrated = db.prepare("SELECT 1 FROM portal_migrations WHERE name = ?").get("road-player-identities-v1");
    // After the first migration, only legacy writers can introduce an unclaimed
    // player. An indexed anti-join keeps rollback compatibility without rewriting
    // or rereading every existing player's records on each process start.
    const previous = db.prepare(`SELECT player FROM records ${migrated ? "WHERE player NOT IN (SELECT player FROM players)" : ""}
      GROUP BY player ORDER BY MIN(created), player`).all().map(row => {
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
    db.prepare("INSERT INTO portal_migrations(name, created) VALUES (?, ?) ON CONFLICT DO NOTHING").run("road-player-identities-v1", Date.now());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  const registered = (player: string) => Boolean(db.prepare("SELECT 1 FROM accounts WHERE player = ?").get(player));
  const leaderboards = createRoadLeaderboards(db, registered, availableName);
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
  const rarity = createAchievementRarity(db);
  const transaction = <T>(work: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  // Explicitly requested on 2026-09-20. One-time adoption, not a permanent override:
  // an owner can make their profile private afterwards, including across restarts.
  transaction(() => {
    const applied = db.prepare("INSERT INTO portal_migrations(name, created) VALUES (?, ?) ON CONFLICT DO NOTHING").run("public-profiles-fry3-20260920", Date.now());
    if (!applied.changes) return;
    for (const account of db.prepare("SELECT player FROM accounts").all()) {
      db.prepare("INSERT INTO portal_profiles(player, public_id, public) VALUES (?, ?, 1) ON CONFLICT(player) DO UPDATE SET public = 1")
        .run(account.player, randomBytes(12).toString("hex"));
    }
  });
  transaction(() => {
    if (!db.prepare("INSERT INTO portal_migrations(name, created) VALUES (?, ?) ON CONFLICT DO NOTHING").run("incubator-achievements-v1", Date.now()).changes) return;
    const insert = db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING");
    for (const row of db.prepare("SELECT i.player, i.state FROM incubator_states i JOIN accounts a ON a.player = i.player").all()) {
      try { for (const id of incubatorAchievements(JSON.parse(String(row.state)) as IncubatorState)) insert.run(row.player, id); }
      catch { /* A malformed old egg cannot block startup. */ }
    }
  });
  const completedRoads = (player: string) => db.prepare("SELECT code FROM road_completions WHERE player = ? ORDER BY code").all(player)
    .map(row => String(row.code)).filter(code => FUN_ROAD_CODES.includes(code));
  const awardRoadExplorer = (player: string) => {
    if (!registered(player) || completedRoads(player).length !== FUN_ROAD_CODES.length) return [];
    db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, "road.explorer");
    // Repeat acknowledgements survive a lost response; the client deduplicates toasts.
    return ["road.explorer"];
  };
  transaction(() => {
    // Adopt historic finishes, including those written during a rollback.
    // A later unfinished personal best must never erase a completed road.
    const adopt = db.prepare(`INSERT INTO road_completions(player, code, completed)
      SELECT player, code, created FROM records WHERE code = ? AND finished = 1
      ON CONFLICT(player, code) DO NOTHING`);
    for (const code of FUN_ROAD_CODES) adopt.run(code);
    for (const row of db.prepare(`SELECT c.player FROM road_completions c JOIN accounts a ON a.player = c.player
      GROUP BY c.player HAVING COUNT(*) >= ?`).all(FUN_ROAD_CODES.length)) awardRoadExplorer(String(row.player));
  });
  const addSession = (player: string, tokenHash: string) => {
    const now = Date.now();
    db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(tokenHash, player, now + ROAD_SESSION_SECONDS * 1000, now);
    db.prepare("DELETE FROM sessions WHERE player = ? AND token NOT IN (SELECT token FROM sessions WHERE player = ? ORDER BY created DESC, rowid DESC LIMIT 10)").run(player, player);
  };
  const ensureProfile = (player: string) => {
    if (!registered(player)) throw new RoadAccountError("An account is required");
    db.prepare("INSERT INTO portal_profiles(player, public_id) VALUES (?, ?) ON CONFLICT(player) DO NOTHING").run(player, randomBytes(12).toString("hex"));
  };
  const progress = createAccountProgress(db, registered, transaction, () => rarity.invalidate());
  const untangleProgress = (player: string): UntangleProgress => {
    const campaigns = db.prepare("SELECT seed, level FROM untangle_puzzles WHERE player = ? AND mode = 'campaign' ORDER BY level").all(player);
    const levels = (versions: readonly string[]) => [...new Set(campaigns.filter(row => versions.includes(parseSeed(String(row.seed))?.version ?? "")).map(row => Number(row.level)))].sort((a, b) => a - b);
    const campaign = levels(["NEST2", "NEST3"]), hardCampaign = levels(["KNOT1", "KNOT2", "KNOT3"]), legacyCampaign = levels(["NEST1"]);
    const days = db.prepare("SELECT DISTINCT day FROM untangle_puzzles WHERE player = ? AND mode = 'daily' ORDER BY day").all(player).map(row => String(row.day));
    let consecutive = 0, bestDailyStreak = 0, previous = -Infinity;
    for (const day of days) {
      const stamp = Date.parse(`${day}T00:00:00Z`) / 86400000;
      consecutive = stamp === previous + 1 ? consecutive + 1 : 1;
      bestDailyStreak = Math.max(bestDailyStreak, consecutive); previous = stamp;
    }
    const today = Date.parse(`${moscowDay()}T00:00:00Z`) / 86400000;
    const dailyStreak = previous === today || previous === today - 1 ? consecutive : 0;
    // Campaign receipts always fit. Older free/daily records remain durable in SQLite;
    // only the cloud response is capped so an active account cannot grow it unboundedly.
    const puzzles: UntanglePuzzleRecord[] = db.prepare(`SELECT seed, level, mode, day, moves, seconds, hints, solves FROM untangle_puzzles
      WHERE player = ? ORDER BY (mode = 'campaign') DESC, updated DESC, seed LIMIT 256`).all(player).map(row => ({
      seed: String(row.seed), level: Number(row.level), mode: row.mode as UntanglePuzzleRecord["mode"],
      ...(row.mode === "daily" ? { day: String(row.day) } : {}), moves: Number(row.moves), seconds: Number(row.seconds), hints: Number(row.hints), solves: Number(row.solves),
    }));
    const totals = db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(seed LIKE 'KNOT1-%' OR seed LIKE 'KNOT2-%' OR seed LIKE 'KNOT3-%'), 0) AS hard FROM untangle_puzzles WHERE player = ?").get(player)!;
    return { campaignVersion: 2, campaign, hardCampaign, legacyCampaign, puzzles, totalSolved: Number(totals.total), hardSolved: Number(totals.hard), dailySolved: days.length, dailyStreak, bestDailyStreak };
  };
  const validateUntangle = (result: PortalRun) => {
    const validated = validatePortalRun(result), u = validated?.untangle;
    if (!u) throw new PortalResultInvalidError("Invalid untangle result");
    try {
      const seed = parseSeed(u.seed);
      if (!seed || seed.seed !== u.seed || seed.level !== u.level) throw new Error("Invalid seed");
      if (u.mode === "campaign" && !isCampaignSeed(u.seed)) throw new Error("Invalid campaign");
      if (u.mode === "daily") {
        const stamp = Date.parse(`${u.day}T00:00:00Z`);
        if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== u.day || u.day! > moscowDay() || !isDailySeed(u.seed, u.day!)) throw new Error("Invalid day");
      }
      const puzzle = generatePuzzle(u.seed);
      if (u.positions.length !== puzzle.initial.length || !analyzeBoard(u.positions, puzzle.edges).solved) throw new Error("Unsolved puzzle");
      if (puzzle.mechanics === "swap" && !isSlotPermutation(puzzle, u.positions)) throw new Error("Invalid slot permutation");
    } catch { throw new PortalResultInvalidError("Invalid untangle solution"); }
    return u;
  };
  const profileView = (player: string): OwnProfile | null => {
    const row = db.prepare(`SELECT p.public_id, p.slug, p.public, p.avatar, n.name FROM portal_profiles p
      JOIN accounts a ON a.player = p.player JOIN players n ON n.player = p.player WHERE p.player = ?`).get(player);
    if (!row) return null;
    const rawStats = db.prepare("SELECT game, best, runs FROM portal_stats WHERE player = ? AND game IN ('road', 'road2', 'fry3', 'chalaza', 'oracle', 'untangle') ORDER BY game").all(player);
    const recordBests = db.prepare(`SELECT COALESCE(MAX(CASE WHEN code LIKE 'EGG1-%' THEN score END), 0) AS classic,
      COALESCE(MAX(CASE WHEN (code LIKE 'EGG2-%' OR code LIKE 'EGG3-%') THEN score END), 0) AS current,
      COALESCE(MAX(score),0) AS lifetime FROM records WHERE player = ?`).get(player)!;
    const currentRoad = rawStats.some(stat => stat.game === "road2") || Number(recordBests.current) > 0;
    const stats: PortalStat[] = rawStats.filter(stat => stat.game !== (currentRoad ? "road" : "road2")).map(stat => ({
      game: (stat.game === "fry3" ? "fry" : stat.game === "road2" ? "road" : stat.game) as PortalStat["game"], best: String(stat.best), runs: Number(stat.runs),
      ...(stat.game === "road2" ? { roadRules: 2 as const } : {}),
    }));
    const roadBest = Number(currentRoad ? recordBests.current : recordBests.classic);
    const classicBest = Math.max(Number(recordBests.classic), Number(rawStats.find(stat => stat.game === "road")?.best ?? 0));
    const road = stats.find(stat => stat.game === "road");
    if (road && BigInt(road.best) < BigInt(roadBest)) road.best = String(roadBest);
    else if (!road && roadBest > 0) stats.push({ game: "road", best: String(roadBest), runs: 0, ...(currentRoad ? { roadRules: 2 as const } : {}) });
    const achievements = db.prepare("SELECT achievement FROM portal_achievements WHERE player = ? ORDER BY achievement").all(player).map(r => String(r.achievement));
    const lifetimeRoadBest = Number(recordBests.lifetime);
    if (lifetimeRoadBest > 0) achievements.push("road.first");
    if (lifetimeRoadBest >= 1000) achievements.push("road.thousand");
    const untangle = untangleProgress(player), untangleStat = stats.find(stat => stat.game === "untangle");
    if (untangleStat) Object.assign(untangleStat, { solved: untangle.totalSolved, completedLevels: untangle.campaign.length,
      hardSolved: untangle.hardSolved, hardCompletedLevels: untangle.hardCampaign.length, legacyCompletedLevels: untangle.legacyCampaign.length,
      dailySolved: untangle.dailySolved, dailyStreak: untangle.dailyStreak });
    const achievementRarity = rarity.read();
    return { id: String(row.slug ?? row.public_id), slug: row.slug ? String(row.slug) : null, name: String(row.name), avatar: Number(row.avatar), public: Boolean(row.public), initiated: progress.initiated(player), incubator: progress.incubator(player), untangle, stats, achievements: [...new Set(achievements)], achievementRarity, frySeason: FRY_SEASON,
      ...(currentRoad && classicBest > 0 ? { classicRoadBest: String(classicBest) } : {}) };
  };
  return {
    ...progress,
    registered,
    ownProfile(player: string) { ensureProfile(player); return profileView(player)!; },
    publicProfile(id: string): PublicProfile | null {
      if (!/^[a-f0-9]{24}$/.test(id) && !validPortalSlug(id)) return null;
      const row = db.prepare(`SELECT p.player FROM portal_profiles p
        LEFT JOIN portal_profile_slug_aliases a ON a.player = p.player
        WHERE p.public = 1 AND (p.public_id = ? OR a.slug = ?) LIMIT 1`).get(id, id);
      const own = row ? profileView(String(row.player)) : null;
      if (!own) return null;
      const { public: visibility, slug, initiated, incubator, untangle, ...profile } = own;
      return profile;
    },
    updateProfileSlug(player: string, slug: unknown) {
      if (!validPortalSlug(slug)) throw new PortalSlugInvalidError("Invalid profile address");
      return transaction(() => {
        ensureProfile(player);
        const claimed = db.prepare("SELECT player FROM portal_profile_slug_aliases WHERE slug = ?").get(slug);
        if (claimed && claimed.player !== player) throw new PortalSlugTakenError("Profile address is taken");
        if (!claimed) db.prepare("INSERT INTO portal_profile_slug_aliases(slug, player) VALUES (?, ?)").run(slug, player);
        db.prepare("UPDATE portal_profiles SET slug = ? WHERE player = ?").run(slug, player);
        return profileView(player)!;
      });
    },
    updateProfile(player: string, publicProfile: boolean, avatar: number) {
      if (typeof publicProfile !== "boolean" || !Number.isInteger(avatar) || avatar < 0 || avatar > 5) throw new TypeError("Invalid profile preferences");
      transaction(() => {
        ensureProfile(player);
        db.prepare("UPDATE portal_profiles SET public = ?, avatar = ? WHERE player = ?").run(Number(publicProfile), avatar, player);
      });
      return profileView(player)!;
    },
    portalResult(player: string, result: PortalRun) {
      transaction(() => {
        ensureProfile(player);
        // Verify before accepting an idempotency key. Invalid geometry or a forged
        // campaign/day must never create partial progress or poison a later retry.
        const untangle = result.game === "untangle" ? validateUntangle(result) : null;
        if (result.guestImport !== undefined) {
          if (!untangle || result.guestImport !== true) throw new PortalResultInvalidError("Invalid guest import");
          const claimed = db.prepare("SELECT player FROM untangle_guest_claims WHERE id = ?").get(result.id);
          if (claimed && claimed.player !== player) throw new PortalGuestClaimedError("Guest result already belongs to another account");
          db.prepare("INSERT INTO untangle_guest_claims(id, player) VALUES (?, ?) ON CONFLICT DO NOTHING").run(result.id, player);
        }
        const inserted = db.prepare("INSERT INTO portal_submissions(player, id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, result.id);
        if (!inserted.changes) return;
        if (untangle) {
          db.prepare(`INSERT INTO untangle_puzzles(player, seed, level, mode, day, moves, seconds, hints, solves, updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(player, seed) DO UPDATE SET
              mode = CASE WHEN untangle_puzzles.mode = 'free' THEN excluded.mode ELSE untangle_puzzles.mode END,
              day = COALESCE(untangle_puzzles.day, excluded.day), moves = MIN(untangle_puzzles.moves, excluded.moves),
              seconds = MIN(untangle_puzzles.seconds, excluded.seconds), hints = MIN(untangle_puzzles.hints, excluded.hints),
              solves = untangle_puzzles.solves + 1, updated = excluded.updated`)
            .run(player, untangle.seed, untangle.level, untangle.mode, untangle.day ?? null, untangle.moves, result.seconds, untangle.hints, Date.now());
          const completed = untangleProgress(player), badges = [];
          if (completed.campaign.length === LEVEL_COUNT || completed.legacyCampaign.length === LEVEL_COUNT) badges.push("untangle.campaign");
          if (completed.hardCampaign.length === LEVEL_COUNT) badges.push("untangle.hard.campaign");
          if (completed.dailySolved >= 7) badges.push("untangle.week");
          if (completed.bestDailyStreak >= 7) badges.push("untangle.streak");
          for (const badge of badges) db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, badge);
        }
        // Old tabs/outboxes omit season and remain in the old bucket. They cannot
        // repopulate the fresh season after deployment or an uncertain retry.
        const game = result.game === "fry" && result.season === FRY_SEASON ? "fry3" : result.game === "road" && result.roadRules === 2 ? "road2" : result.game;
        const previous = db.prepare("SELECT best FROM portal_stats WHERE player = ? AND game = ?").get(player, game);
        const best = previous && BigInt(String(previous.best)) > BigInt(result.score) ? String(previous.best) : result.score;
        db.prepare(`INSERT INTO portal_stats(player, game, best, runs) VALUES (?, ?, ?, 1)
          ON CONFLICT(player, game) DO UPDATE SET best = excluded.best, runs = portal_stats.runs + 1`).run(player, game, best);
        for (const achievement of earnedAchievements(result)) db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, achievement);
      });
      rarity.invalidate();
      return profileView(player)!;
    },
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
        db.prepare("UPDATE road_completions SET player = ? WHERE player = ?").run(accountPlayer, player);
        db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?)").run(accountPlayer, player, password, recovery, Date.now());
        // New registrations use the announced public-profile default.
        db.prepare("INSERT INTO portal_profiles(player, public_id, public) VALUES (?, ?, 1)").run(accountPlayer, randomBytes(12).toString("hex"));
        awardRoadExplorer(accountPlayer);
        addSession(accountPlayer, tokenHash);
      });
      rarity.invalidate();
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
    ...leaderboards,
    read(code: string, player: string) {
      return { ...leaderboards.read(code, player), completedRoads: completedRoads(player) };
    },
    submit(player: string, run: PublishedRun) {
      // The claim and the score are one transaction, including between workers.
      const unlocked = transaction(() => {
        // Registered names are login names and cannot change through score submission.
        if (run.expectedOwner !== undefined) {
          const actual = registered(player) ? normalizePlayerName(this.account(player).name)!.key : null;
          if (actual !== run.expectedOwner) throw new RoadAccountChangedError("Account changed");
        }
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
        if (run.finished && FUN_ROAD_CODES.includes(run.code)) {
          db.prepare("INSERT INTO road_completions(player, code, completed) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(player, run.code, Date.now());
          return awardRoadExplorer(player);
        }
        return [];
      });
      rarity.invalidate();
      return { ...this.read(run.code, player), unlocked };
    },
    close() { db.close(); },
  };
}

let store: ReturnType<typeof createRoadRecordStore> | undefined;
export function roadRecordStore() {
  return store ??= createRoadRecordStore(resolve(process.env.EGG_ROAD_DATA_DIR ?? join(process.env.KLADKA_DATA_DIR ?? ".kladka", "egg-road")));
}
