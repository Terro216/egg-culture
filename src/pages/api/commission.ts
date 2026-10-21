import type { APIRoute } from "astro";
import { commissionStore, CommissionConflict, CommissionInvalid, validSlot } from "../../server/commissionStore.ts";
import { checkRoadWrite, roadIp, sessionRoadPlayer } from "../../server/roadHttp.ts";
import { roadRecordStore } from "../../server/roadRecords.ts";
import { moscowDay, validDate } from "../../features/Commission/engine.ts";

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "Vary": "Cookie",
  "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff",
} });
const limits = new Map<string, { until: number; count: number }>();
function allowed(ip: string) {
  const now = Date.now(); for (const [key, item] of limits) if (item.until < now) limits.delete(key);
  const entry = limits.get(ip) ?? { until: now + 60000, count: 0 };
  if (!limits.has(ip) && limits.size >= 10000) return false;
  limits.set(ip, entry); return ++entry.count <= 90;
}
const identity = (context: Parameters<APIRoute>[0]) => {
  const player = sessionRoadPlayer(context);
  return player ? { player, name: roadRecordStore().account(player).name } : null;
};
export const GET: APIRoute = async context => {
  if (!allowed(roadIp(context))) return json({ error: "rate_limit" }, 429);
  try {
    const owner = identity(context), today = moscowDay();
    const date = context.url.searchParams.get("date") ?? today;
    const slot = context.url.searchParams.get("slot") ?? "campaign";
    if (!validSlot(slot) || !validDate(date)) return json({ error: "invalid_request" }, 400);
    const store = commissionStore();
    return json({ owner: owner?.name ?? null, today, ...(owner ? store.read(owner.player, slot) : { run: null, revision: 0, updated: 0 }),
      achievements: owner ? store.badges(owner.player) : [], standings: store.standings(date, owner?.player), published: owner ? store.published(owner.player, date) : false });
  } catch { return json({ error: "unavailable" }, 503); }
};
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context);
  if (denied) return json({ error: "origin_or_content_type" }, denied.status);
  if (!allowed(roadIp(context))) return json({ error: "rate_limit" }, 429);
  try {
    const owner = identity(context); if (!owner) return json({ error: "unauthorized" }, 401);
    const reader = context.request.body?.getReader(); if (!reader) return json({ error: "invalid_body" }, 400);
    const parts: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 196608) { await reader.cancel(); return json({ error: "too_large" }, 413); } parts.push(part.value); }
    } finally { reader.releaseLock(); }
    let body: Record<string, unknown>;
    try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return json({ error: "invalid_body" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
    if (typeof body.expectedName !== "string" || body.expectedName.normalize("NFKC").toLowerCase() !== owner.name.normalize("NFKC").toLowerCase()) return json({ error: "account_changed" }, 409);
    const store = commissionStore();
    if (body.action === "save") return json({ ...store.save(owner.player, body.run, Number(body.revision), body.replace === true), achievements: store.badges(owner.player) });
    if (body.action === "publish" && validDate(body.date) && typeof body.enabled === "boolean") {
      store.publish(owner.player, owner.name, body.date, body.enabled);
      return json({ standings: store.standings(body.date, owner.player), published: store.published(owner.player, body.date) });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof CommissionConflict) return json({ error: "conflict" }, 409);
    if (error instanceof CommissionInvalid) return json({ error: "invalid_run" }, 400);
    return json({ error: "unavailable" }, 503);
  }
};
