import type { DatabaseSync } from "node:sqlite";
import { advanceIncubator, incubatorAchievements, incubatorDay, validIncubatorState } from "../features/Incubator/rules.ts";
import type { IncubatorState } from "../features/Incubator/rules.ts";

/** Durable progress is keyed by the authenticated account, never a device ID. */
export function createAccountProgress(db: DatabaseSync, registered: (player: string) => boolean, transaction: <T>(work: () => T) => T, invalidateRarity: () => void) {
  db.exec(`CREATE TABLE IF NOT EXISTS portal_initiation (player TEXT PRIMARY KEY, completed INTEGER NOT NULL) STRICT;`);
  return {
    incubator(player: string): IncubatorState | null {
      if (!registered(player)) return null;
      const row = db.prepare("SELECT state FROM incubator_states WHERE player = ?").get(player);
      return row ? JSON.parse(String(row.state)) as IncubatorState : null;
    },
    incubatorAction(player: string, action: "lay" | "warm" | "import", legacy?: unknown) {
      if (!registered(player)) throw new Error("An account is required");
      return transaction(() => {
        const row = db.prepare("SELECT state FROM incubator_states WHERE player = ?").get(player);
        const current = row ? JSON.parse(String(row.state)) as IncubatorState : null;
        const today = incubatorDay();
        const next = action === "import" ? (!current && validIncubatorState(legacy, today) ? legacy : null) : advanceIncubator(current, action, today);
        const unlocked: string[] = [];
        if (next) {
          db.prepare("INSERT INTO incubator_states(player, state) VALUES (?, ?) ON CONFLICT(player) DO UPDATE SET state = excluded.state").run(player, JSON.stringify(next));
          const insert = db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING");
          for (const id of incubatorAchievements(next)) if (insert.run(player, id).changes) unlocked.push(id);
        }
        if (unlocked.length) invalidateRarity();
        return { state: next ?? current, today, unlocked };
      });
    },
    manifestoVisit(player: string, active: boolean, now = Date.now()) {
      if (!registered(player)) throw new Error("An account is required");
      return transaction(() => {
        const previous = db.prepare("SELECT elapsed_ms, last_seen_ms, active FROM manifesto_progress WHERE player = ?").get(player);
        const delta = previous ? now - Number(previous.last_seen_ms) : 0;
        const credit = previous?.active && active && delta > 0 && delta <= 30000 ? Math.min(delta, 20000) : 0;
        const elapsed = Math.min(240000, Number(previous?.elapsed_ms ?? 0) + credit);
        db.prepare(`INSERT INTO manifesto_progress(player, elapsed_ms, last_seen_ms, active) VALUES (?, ?, ?, ?)
          ON CONFLICT(player) DO UPDATE SET elapsed_ms = excluded.elapsed_ms, last_seen_ms = excluded.last_seen_ms, active = excluded.active`)
          .run(player, elapsed, now, Number(active));
        const unlocked = elapsed >= 240000 && Boolean(db.prepare("INSERT INTO portal_achievements(player, achievement) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, "manifesto.scholar").changes);
        if (unlocked) invalidateRarity();
        return { elapsed, unlocked };
      });
    },
    initiated(player: string) { return Boolean(db.prepare("SELECT 1 FROM portal_initiation WHERE player = ?").get(player)); },
    completeInitiation(player: string) {
      if (!registered(player)) throw new Error("An account is required");
      transaction(() => { db.prepare("INSERT INTO portal_initiation(player, completed) VALUES (?, ?) ON CONFLICT DO NOTHING").run(player, Date.now()); });
    },
  };
}
