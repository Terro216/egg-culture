import type { APIRoute } from "astro";
import { canonicalRoadCode, parsePublishedRun } from "../../features/EggRoad/leaderboard.ts";
import { roadRecordStore, RoadNameTakenError, RoadAccountChangedError } from "../../server/roadRecords.ts";
import { allowRoadRequest as allowed, roadPlayer as player, roadJson as json, checkRoadWrite, readRoadBody } from "../../server/roadHttp.ts";
import { plausibleRoadRun, RoadValidationBusyError } from "../../server/roadValidation.ts";
import { reportRoadFailure } from "../../server/roadDiagnostics.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  if (!allowed(context, "read")) return json({ error: "rate_limit" }, 429);
  if (context.url.searchParams.get("view") === "popular") {
    const filter = context.url.searchParams.get("mode") ?? "all";
    if (!["all", "finite", "endless"].includes(filter)) return json({ error: "invalid_mode" }, 400);
    try { return json(roadRecordStore().popular(filter as "all" | "finite" | "endless")); }
    catch (error) { reportRoadFailure("popular", error); return json({ error: "unavailable" }, 503); }
  }
  const code = canonicalRoadCode(context.url.searchParams.get("code"));
  if (!code) return json({ error: "invalid_code" }, 400);
  try { return json(roadRecordStore().read(code, player(context))); }
  catch (error) { reportRoadFailure("read", error); return json({ error: "unavailable" }, 503); }
};
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  if (!allowed(context, "write")) return json({ error: "rate_limit" }, 429);
  const body = await readRoadBody(context.request); if (body.error) return body.error;
  const run = parsePublishedRun(body.value);
  if (!run) return json({ error: "invalid_run" }, 400);
  try {
    if (!await plausibleRoadRun(run)) return json({ error: "invalid_run" }, 400);
    return json(roadRecordStore().submit(player(context), run));
  }
  catch (error) {
    if (error instanceof RoadValidationBusyError) return json({ error: "busy" }, 503);
    if (error instanceof RoadNameTakenError) return json({ error: "name_taken" }, 409);
    if (error instanceof RoadAccountChangedError) return json({ error: "account_changed" }, 409);
    reportRoadFailure("submit", error);
    return json({ error: "unavailable" }, 503);
  }
};
