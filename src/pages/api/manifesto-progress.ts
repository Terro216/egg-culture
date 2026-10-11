import type { APIRoute } from "astro";
import { roadRecordStore } from "../../server/roadRecords.ts";
import { allowRoadRequest, checkRoadWrite, readRoadBody, roadJson as json, sessionRoadPlayer } from "../../server/roadHttp.ts";

import { normalizePlayerName } from "../../features/EggRoad/leaderboard.ts";

export const prerender = false;
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  if (!allowRoadRequest(context, "write")) return json({ error: "rate_limit" }, 429);
  const parsed = await readRoadBody(context.request); if (parsed.error) return parsed.error;
  const body = parsed.value;
  if (!body || typeof body !== "object" || typeof (body as { active?: unknown }).active !== "boolean") return json({ error: "invalid_body" }, 400);
  try {
    const player = sessionRoadPlayer(context);
    if (!player) return json({ error: "unauthorized" }, 401);
    if (normalizePlayerName((body as { expectedName?: unknown }).expectedName)?.key !== normalizePlayerName(roadRecordStore().account(player).name)?.key) return json({ error: "account_changed" }, 409);
    const progress = roadRecordStore().manifestoVisit(player, (body as { active: boolean }).active);
    return json(progress);
  } catch { return json({ error: "unavailable" }, 503); }
};
