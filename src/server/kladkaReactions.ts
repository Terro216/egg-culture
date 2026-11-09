import type { DatabaseSync } from "node:sqlite";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { isKladkaReaction, KLADKA_REACTIONS, KLADKA_REACTION_MAX } from "../shared/kladkaReactions.ts";
import type { KladkaReaction, KladkaReactionAccess, KladkaReactionSummary } from "../shared/kladkaReactions.ts";

const DAY = 86400000;
export class KladkaReactionError extends Error {
  code: string;
  status: number;
  retryAfter: number;
  constructor(code: string, status: number, retryAfter = 0) {
    super(code); this.code = code; this.status = status; this.retryAfter = retryAfter;
  }
}

/** Only explicitly configured proxy hops can supply an address. Compose uses one Caddy hop. */
export function reactionNetwork(request: Request, peer: string, hops = Number(process.env.KLADKA_REACTION_PROXY_HOPS ?? 0)): string {
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error("Invalid reaction proxy configuration");
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const address = hops ? (forwarded.length <= 1024 ? forwarded.split(",").at(-hops)?.trim() : undefined) : peer;
  if (!address || !isIP(address)) throw new KladkaReactionError("network_unavailable", 503);
  if (isIP(address) === 4) return address;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::").map(part => part ? part.split(":") : []);
  const words = right ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  const numbers = words.map(word => parseInt(word, 16));
  if (numbers.slice(0, 5).every(word => word === 0) && numbers[5] === 65535) {
    return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join(".");
  }
  // IPv6 privacy addresses within one /64 share a budget.
  return numbers.slice(0, 4).map(word => word.toString(16)).join(":") + "::/64";
}

export function createKladkaReactions(db: DatabaseSync, transaction: <T>(work: () => T) => T) {
  db.exec(`CREATE TABLE IF NOT EXISTS kladka_reactions (
    post TEXT NOT NULL, player TEXT NOT NULL,
    reaction TEXT NOT NULL CHECK(reaction IN ('shell','yolk','hatch','warm','fry')),
    PRIMARY KEY(post, player)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS kladka_reaction_limits (
    key TEXT PRIMARY KEY, until INTEGER NOT NULL, count INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS kladka_reaction_limit_expiry ON kladka_reaction_limits(until);
  CREATE TABLE IF NOT EXISTS kladka_reaction_networks (
    post TEXT NOT NULL, network TEXT NOT NULL, player TEXT NOT NULL, until INTEGER NOT NULL,
    PRIMARY KEY(post, network, player)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS kladka_reaction_network_expiry ON kladka_reaction_networks(until);
  CREATE TABLE IF NOT EXISTS kladka_reaction_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;`);
  // Preserve the original row and its unique key for existing votes, old tabs
  // and an image rollback. The other two selections are an additive extension.
  db.exec(`CREATE TABLE IF NOT EXISTS kladka_reaction_extras (
    post TEXT NOT NULL, player TEXT NOT NULL,
    reaction TEXT NOT NULL CHECK(reaction IN ('shell','yolk','hatch','warm','fry')),
    PRIMARY KEY(post, player, reaction)
  ) STRICT;
  CREATE TRIGGER IF NOT EXISTS kladka_reaction_extras_delete AFTER DELETE ON kladka_reactions
    BEGIN DELETE FROM kladka_reaction_extras WHERE post = OLD.post AND player = OLD.player; END;
  CREATE TRIGGER IF NOT EXISTS kladka_reaction_extras_replace AFTER UPDATE OF reaction ON kladka_reactions
    BEGIN DELETE FROM kladka_reaction_extras WHERE post = OLD.post AND player = OLD.player; END;
  CREATE TRIGGER IF NOT EXISTS kladka_reaction_extras_limit BEFORE INSERT ON kladka_reaction_extras
    WHEN NOT EXISTS (SELECT 1 FROM kladka_reactions WHERE post = NEW.post AND player = NEW.player AND reaction != NEW.reaction)
      OR (SELECT COUNT(*) FROM kladka_reaction_extras WHERE post = NEW.post AND player = NEW.player) >= 2
    BEGIN SELECT RAISE(ABORT, 'Invalid additional reaction'); END;`);
  db.prepare("INSERT INTO kladka_reaction_settings VALUES ('network-key', ?) ON CONFLICT DO NOTHING").run(randomBytes(32).toString("hex"));
  const secret = String(db.prepare("SELECT value FROM kladka_reaction_settings WHERE key = 'network-key'").get()!.value);
  const access = (player: string | null): KladkaReactionAccess => {
    const account = player ? db.prepare("SELECT 1 FROM accounts WHERE player = ?").get(player) : null;
    if (!account) return { reason: "login" };
    if (!db.prepare("SELECT 1 FROM portal_initiation WHERE player = ?").get(player!)) return { reason: "initiation" };
    return { reason: "ready" };
  };
  const summaries = (posts: string[], player: string | null): Record<string, KladkaReactionSummary> => {
    if (posts.length > 100) throw new RangeError("Too many entries");
    const result: Record<string, KladkaReactionSummary> = {};
    if (!posts.length) return result;
    for (const post of posts) result[post] = { counts: {}, mine: null, selected: [] };
    const placeholders = posts.map(() => "?").join(",");
    const votes = `(SELECT post, player, reaction FROM kladka_reactions UNION ALL SELECT post, player, reaction FROM kladka_reaction_extras)`;
    for (const row of db.prepare(`SELECT post, reaction, COUNT(*) AS count FROM ${votes}
      WHERE post IN (${placeholders}) GROUP BY post, reaction`).all(...posts)) {
      result[String(row.post)].counts[row.reaction as KladkaReaction] = Number(row.count);
    }
    if (player) {
      for (const row of db.prepare(`SELECT post, reaction FROM kladka_reactions
        WHERE player = ? AND post IN (${placeholders})`).all(player, ...posts)) result[String(row.post)].mine = row.reaction as KladkaReaction;
      for (const row of db.prepare(`SELECT post, reaction FROM ${votes}
        WHERE player = ? AND post IN (${placeholders})`).all(player, ...posts)) result[String(row.post)].selected.push(row.reaction as KladkaReaction);
      for (const item of Object.values(result)) item.selected = KLADKA_REACTIONS.map(item => item.id).filter(id => item.selected.includes(id));
    }
    return result;
  };
  function change(post: string, player: string, network: string, modify: (current: KladkaReaction[]) => KladkaReaction[], now: number) {
    if (!/^[a-f0-9-]{1,64}$/.test(post)) throw new KladkaReactionError("invalid_body", 400);
    return transaction(() => {
      const eligibility = access(player);
      if (eligibility.reason !== "ready") throw new KladkaReactionError(eligibility.reason, eligibility.reason === "login" ? 401 : 403);
      const previous = summaries([post], player)[post], current = previous.selected;
      const next = modify(current);
      if (next.length > KLADKA_REACTION_MAX) throw new KladkaReactionError("reaction_limit", 409);
      // Each emoji has a desired boolean state. Retries cannot toggle it or
      // overwrite another device's changes to the other selections.
      if (next.length === current.length && next.every(id => current.includes(id))) return previous;
      const adding = next.some(id => !current.includes(id));
      const networkHash = createHmac("sha256", secret).update(network).digest("hex");
      db.prepare("DELETE FROM kladka_reaction_limits WHERE until <= ?").run(now);
      db.prepare("DELETE FROM kladka_reaction_networks WHERE until <= ?").run(now);
      const budgets = [
        { key: `account-minute:${player}`, maximum: 20, window: 60000 },
        { key: `account-day:${player}`, maximum: 200, window: DAY },
        { key: `network-minute:${networkHash}`, maximum: 60, window: 60000 },
        { key: `network-day:${networkHash}`, maximum: 500, window: DAY },
      ];
      for (const budget of budgets) {
        const row = db.prepare("SELECT count, until FROM kladka_reaction_limits WHERE key = ?").get(budget.key);
        if (row && Number(row.count) >= budget.maximum) throw new KladkaReactionError("rate_limit", 429, Math.max(1, Math.ceil((Number(row.until) - now) / 1000)));
      }
      if (adding) {
        const known = db.prepare("SELECT 1 FROM kladka_reaction_networks WHERE post = ? AND network = ? AND player = ?").get(post, networkHash, player);
        if (!known) {
          const voters = db.prepare("SELECT COUNT(*) AS count, MIN(until) AS until FROM kladka_reaction_networks WHERE post = ? AND network = ?").get(post, networkHash)!;
          if (Number(voters.count) >= 5) throw new KladkaReactionError("network_limit", 429, Math.max(1, Math.ceil((Number(voters.until) - now) / 1000)));
        }
        // Removal cannot free another account's slot; the admission survives for a day.
        db.prepare(`INSERT INTO kladka_reaction_networks VALUES (?, ?, ?, ?)
          ON CONFLICT(post, network, player) DO UPDATE SET until = excluded.until`).run(post, networkHash, player, now + DAY);
      }
      db.prepare("DELETE FROM kladka_reaction_extras WHERE post = ? AND player = ?").run(post, player);
      if (next.length) {
        // Keep the primary selection stable when adding/removing other emoji.
        const primary = previous.mine && next.includes(previous.mine) ? previous.mine : next[0];
        db.prepare(`INSERT INTO kladka_reactions VALUES (?, ?, ?)
          ON CONFLICT(post, player) DO UPDATE SET reaction = excluded.reaction`).run(post, player, primary);
        for (const id of next) if (id !== primary) db.prepare("INSERT INTO kladka_reaction_extras VALUES (?, ?, ?)").run(post, player, id);
      } else db.prepare("DELETE FROM kladka_reactions WHERE post = ? AND player = ?").run(post, player);
      for (const budget of budgets) db.prepare(`INSERT INTO kladka_reaction_limits VALUES (?, ?, 1)
        ON CONFLICT(key) DO UPDATE SET count = count + 1`).run(budget.key, now + budget.window);
      return summaries([post], player)[post];
    });
  }
  return {
    reactionAccess: access,
    reactionSummaries: summaries,
    selectReaction(post: string, player: string, reaction: KladkaReaction, selected: boolean, network: string, now = Date.now()) {
      if (!isKladkaReaction(reaction) || typeof selected !== "boolean") throw new KladkaReactionError("invalid_body", 400);
      return change(post, player, network, current => selected ? [...new Set([...current, reaction])] : current.filter(id => id !== reaction), now);
    },
    // Compatibility for the single-reaction API and previously loaded clients.
    setReaction(post: string, player: string, reaction: KladkaReaction | null, network: string, now = Date.now()) {
      if (reaction !== null && !isKladkaReaction(reaction)) throw new KladkaReactionError("invalid_body", 400);
      return change(post, player, network, () => reaction === null ? [] : [reaction], now);
    },
  };
}
