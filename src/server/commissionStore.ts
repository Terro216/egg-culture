import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { achievementCopy } from "../features/Commission/content.ts";
import { dailyResult, moscowDay, restoreRun, validDate } from "../features/Commission/engine.ts";
import type { Run } from "../features/Commission/types.ts";

export class CommissionConflict extends Error {}
export class CommissionInvalid extends Error {}
export function slotFor(run: Pick<Run, "mode" | "date">) { return run.mode === "campaign" ? "campaign" : `daily:${run.date}`; }
export function validSlot(slot: unknown): slot is string { return slot === "campaign" || typeof slot === "string" && slot.startsWith("daily:") && validDate(slot.slice(6)); }
type SavedRow = { body: string; revision: number; updated: number };
export function createCommissionStore(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Use the database already covered by the online backup, in additive tables.
  const db = new DatabaseSync(join(directory, "records.sqlite"));
  db.exec(`PRAGMA busy_timeout = 3000; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS commission_saves (
      player TEXT NOT NULL, slot TEXT NOT NULL, body TEXT NOT NULL,
      revision INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, slot)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS commission_badges (
      player TEXT NOT NULL, badge TEXT NOT NULL, created INTEGER NOT NULL,
      PRIMARY KEY(player, badge)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS commission_daily (
      player TEXT NOT NULL, date TEXT NOT NULL, name TEXT NOT NULL,
      score INTEGER NOT NULL, correct INTEGER NOT NULL, errors INTEGER NOT NULL,
      time_left INTEGER NOT NULL, published INTEGER NOT NULL,
      PRIMARY KEY(player, date)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS commission_daily_rank ON commission_daily(date, score DESC, time_left DESC, published);
  `);
  const row = (player: string, slot: string) => db.prepare("SELECT body, revision, updated FROM commission_saves WHERE player = ? AND slot = ?").get(player, slot) as SavedRow | undefined;
  return {
    read(player: string, slot: string) {
      if (!validSlot(slot)) throw new CommissionInvalid("slot");
      const found = row(player, slot);
      if (!found) return { run: null, revision: 0, updated: 0 };
      const restored = restoreRun(JSON.parse(found.body));
      if (!restored) throw new CommissionInvalid("stored_run");
      return { run: restored.run, revision: found.revision, updated: found.updated };
    },
    badges(player: string) { return db.prepare("SELECT badge FROM commission_badges WHERE player = ? ORDER BY created, badge").all(player).map(r => String(r.badge)).filter(id => id in achievementCopy); },
    save(player: string, value: unknown, expectedRevision: number, replace = false) {
      const restored = restoreRun(value);
      if (!restored || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new CommissionInvalid("run");
      const { run, state } = restored, slot = slotFor(run);
      if (run.mode === "daily" && run.date > moscowDay()) throw new CommissionInvalid("future_date");
      db.exec("BEGIN IMMEDIATE");
      try {
        const previous = row(player, slot);
        if ((previous?.revision ?? 0) !== expectedRevision) throw new CommissionConflict("revision");
        const body = JSON.stringify(run);
        if (previous?.body === body) { db.exec("COMMIT"); return { revision: previous.revision, updated: previous.updated }; }
        if (previous && !replace) {
          const old = JSON.parse(previous.body) as Run;
          if (old.id !== run.id || old.seed !== run.seed || old.actions.length > run.actions.length || JSON.stringify(old.actions) !== JSON.stringify(run.actions.slice(0, old.actions.length))) throw new CommissionConflict("diverged");
        }
        const revision = expectedRevision + 1, updated = Date.now();
        db.prepare("INSERT INTO commission_saves VALUES (?, ?, ?, ?, ?) ON CONFLICT(player,slot) DO UPDATE SET body=excluded.body, revision=excluded.revision, updated=excluded.updated").run(player, slot, body, revision, updated);
        for (const badge of state.achievements) db.prepare("INSERT OR IGNORE INTO commission_badges VALUES (?, ?, ?)").run(player, badge, updated);
        db.exec("COMMIT"); return { revision, updated };
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    publish(player: string, name: string, date: string, enabled: boolean) {
      if (!validDate(date) || date > moscowDay()) throw new CommissionInvalid("date");
      if (!enabled) { db.prepare("DELETE FROM commission_daily WHERE player = ? AND date = ?").run(player, date); return; }
      const stored = row(player, `daily:${date}`);
      const restored = stored && restoreRun(JSON.parse(stored.body));
      if (!restored || restored.state.phase !== "ended") throw new CommissionInvalid("unfinished");
      const result = dailyResult(restored.state);
      db.prepare(`INSERT INTO commission_daily VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player,date) DO UPDATE SET name=excluded.name, score=excluded.score,
        correct=excluded.correct, errors=excluded.errors, time_left=excluded.time_left, published=excluded.published
        WHERE excluded.score > commission_daily.score OR (excluded.score = commission_daily.score AND excluded.time_left >= commission_daily.time_left)`)
        .run(player, date, name, result.score, result.correct, result.errors, result.time, Date.now());
    },
    standings(date: string, player: string | null = null) {
      if (!validDate(date)) throw new CommissionInvalid("date");
      const rows = db.prepare("SELECT player, name, score, correct, errors, time_left FROM commission_daily WHERE date = ? ORDER BY score DESC, time_left DESC, published ASC LIMIT 30").all(date);
      return rows.map((r, i) => ({ rank: i + 1, name: String(r.name), score: Number(r.score), correct: Number(r.correct), errors: Number(r.errors), time: Number(r.time_left), own: player !== null && r.player === player }));
    },
    published(player: string, date: string) { return Boolean(db.prepare("SELECT 1 FROM commission_daily WHERE player = ? AND date = ?").get(player, date)); },
    close() { db.close(); },
  };
}
let store: ReturnType<typeof createCommissionStore> | undefined;
export function commissionStore() {
  return store ??= createCommissionStore(resolve(process.env.EGG_ROAD_DATA_DIR ?? join(process.env.KLADKA_DATA_DIR ?? ".kladka", "egg-road")));
}
