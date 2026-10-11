import type { APIRoute } from "astro";
import { roadRecordStore } from "../../server/roadRecords.ts";
import { incubatorDay, incubatorMode } from "../../server/incubatorRules.ts";
import { normalizePlayerName } from "../../features/EggRoad/leaderboard.ts";
import { allowRoadRequest, checkRoadWrite, readRoadBody, roadJson as json, sessionRoadPlayer } from "../../server/roadHttp.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  if (!allowRoadRequest(context, "read")) return json({ error: "rate_limit" }, 429);
  try {
    const player = sessionRoadPlayer(context);
    if (!player) return json({ error: "unauthorized" }, 401);
    if (normalizePlayerName(context.url.searchParams.get("expectedName"))?.key !== normalizePlayerName(roadRecordStore().account(player).name)?.key) return json({ error: "account_changed" }, 409);
    const today = incubatorDay(), state = roadRecordStore().incubator(player);
    return json({ state, today, ...incubatorMode(state, today) });
  } catch { return json({ error: "unavailable" }, 503); }
};
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  if (!allowRoadRequest(context, "write")) return json({ error: "rate_limit" }, 429);
  const parsed = await readRoadBody(context.request); if (parsed.error) return parsed.error;
  const body = parsed.value as Record<string, unknown> | null;
  if (!body || !["lay", "warm", "import"].includes(String(body.action))) return json({ error: "invalid_action" }, 400);
  try {
    const player = sessionRoadPlayer(context);
    if (!player) return json({ error: "unauthorized" }, 401);
    const store = roadRecordStore();
    if (normalizePlayerName(body.expectedName)?.key !== normalizePlayerName(store.account(player).name)?.key) return json({ error: "account_changed" }, 409);
    if (!store.allowAuth(`incubator:${player}`, 30, 60000)) return json({ error: "rate_limit" }, 429);
    const result = store.incubatorAction(player, body.action as "lay" | "warm" | "import", body.state);
    return json({ ...result, ...incubatorMode(result.state, result.today) });
  } catch { return json({ error: "unavailable" }, 503); }
};
