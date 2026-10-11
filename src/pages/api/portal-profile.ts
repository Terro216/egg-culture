import type { APIRoute } from "astro";
import { roadRecordStore, PortalSlugInvalidError, PortalSlugTakenError, PortalResultInvalidError, PortalGuestClaimedError } from "../../server/roadRecords.ts";
import { allowRoadRequest, checkRoadWrite, readRoadBody, roadJson as json, sessionRoadPlayer } from "../../server/roadHttp.ts";
import { normalizePlayerName } from "../../features/EggRoad/leaderboard.ts";
import { validInitiationAnswers } from "../../features/Portal/initiation.ts";
import { validatePortalRun } from "../../features/Portal/model.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  if (!allowRoadRequest(context, "read")) return json({ error: "rate_limit" }, 429);
  try {
    const store = roadRecordStore();
    if (context.url.searchParams.has("id")) {
      const profile = store.publicProfile(context.url.searchParams.get("id") ?? "");
      return profile ? json({ profile }) : json({ error: "not_found" }, 404);
    }
    const player = sessionRoadPlayer(context);
    return json(player ? { account: store.account(player), profile: store.ownProfile(player) } : { account: { name: "", registered: false }, profile: null });
  } catch { return json({ error: "unavailable" }, 503); }
};

export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  if (!allowRoadRequest(context, "write")) return json({ error: "rate_limit" }, 429);
  const parsed = await readRoadBody(context.request); if (parsed.error) return parsed.error;
  if (!parsed.value || typeof parsed.value !== "object") return json({ error: "invalid_body" }, 400);
  const body = parsed.value as Record<string, unknown>;
  try {
    const player = sessionRoadPlayer(context);
    if (!player) return json({ error: "unauthorized" }, 401);
    const store = roadRecordStore(), account = store.account(player);
    // A run queued by another account/browser session must never cross identities.
    if (normalizePlayerName(body.expectedName)?.key !== normalizePlayerName(account.name)?.key) return json({ error: "account_changed" }, 409);
    if (!store.allowAuth(`portal:${player}`, 30, 60000)) return json({ error: "rate_limit" }, 429);
    if (body.action === "initiation") {
      if (!validInitiationAnswers(body.answers)) return json({ error: "invalid_answers" }, 400);
      store.completeInitiation(player);
      return json({ profile: store.ownProfile(player) });
    }
    if (body.action === "settings") {
      if (typeof body.public !== "boolean" || !Number.isInteger(body.avatar) || Number(body.avatar) < 0 || Number(body.avatar) > 5) return json({ error: "invalid_profile" }, 400);
      return json({ profile: store.updateProfile(player, body.public, Number(body.avatar)) });
    }
    if (body.action === "slug") return json({ profile: store.updateProfileSlug(player, body.slug) });
    if (body.action === "result") {
      const run = validatePortalRun(body.run);
      if (!run) return json({ error: "invalid_result" }, 400);
      return json({ profile: store.portalResult(player, run) });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof PortalGuestClaimedError) return json({ error: "guest_result_claimed" }, 409);
    if (error instanceof PortalResultInvalidError) return json({ error: "invalid_result" }, 400);
    if (error instanceof PortalSlugInvalidError) return json({ error: "invalid_slug" }, 400);
    if (error instanceof PortalSlugTakenError) return json({ error: "slug_taken" }, 409);
    return json({ error: "unavailable" }, 503);
  }
};
