import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { normalizePlayerName } from "../../features/EggRoad/leaderboard.ts";
import { roadRecordStore, RoadNameTakenError, RoadAccountError } from "../../server/roadRecords.ts";
import { hashPassword, verifyPassword, validPassword, newRecoveryCode, recoveryDigest, newSessionToken, digestToken, PasswordBusyError } from "../../server/roadPasswords.ts";
import { allowRoadRequest, roadJson as json, roadIp, roadPlayer, guestRoadPlayer, sessionRoadPlayer, setRoadSession, clearRoadSession, checkRoadWrite, readRoadBody } from "../../server/roadHttp.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  if (!allowRoadRequest(context, "read")) return json({ error: "rate_limit" }, 429);
  try { return json(roadRecordStore().account(roadPlayer(context))); }
  catch { return json({ error: "unavailable" }, 503); }
};
export const POST: APIRoute = async context => {
  const denied = checkRoadWrite(context); if (denied) return denied;
  const body = await readRoadBody(context.request); if (body.error) return body.error;
  if (!body.value || typeof body.value !== "object") return json({ error: "invalid_body" }, 400);
  const { action, name, password, currentPassword, recoveryCode } = body.value as Record<string, unknown>;
  if (!["register", "login", "recover", "change", "logout"].includes(String(action))) return json({ error: "invalid_action" }, 400);
  try {
    const store = roadRecordStore();
    if (!store.allowAuth(`ip:${roadIp(context)}`, 30, 15 * 60000)) return json({ error: "rate_limit" }, 429);
    if (action === "logout") {
      clearRoadSession(context);
      return json({ account: store.account(guestRoadPlayer(context)) });
    }
    if (!validPassword(password)) return json({ error: "password_length" }, 400);
    const loggedIn = sessionRoadPlayer(context);
    if (action === "register" && loggedIn) return json({ error: "already_registered" }, 409);
    if (action === "change" && !loggedIn) return json({ error: "unauthorized" }, 401);
    const identity = normalizePlayerName(action === "change" ? store.account(loggedIn!).name : name);
    if (!identity) return json({ error: "invalid_name" }, 400);
    if (!store.allowAuth(`name:${digestToken(identity.key)}`, 20, 15 * 60000)) return json({ error: "rate_limit" }, 429);
    const token = newSessionToken();
    if (action === "register") {
      const guest = guestRoadPlayer(context);
      const recovery = newRecoveryCode();
      const profile = store.register(guest, identity.name, await hashPassword(password), recoveryDigest(recovery)!, digestToken(token));
      setRoadSession(context, token); guestRoadPlayer(context, true);
      return json({ account: profile, recoveryCode: recovery });
    }
    const credentials = store.credentials(identity.name);
    if (action === "login") {
      if (!await verifyPassword(password, credentials?.password ?? null) || !credentials) return json({ error: "invalid_credentials" }, 401);
      const profile = store.login(credentials, digestToken(token));
      setRoadSession(context, token);
      return json({ account: profile });
    }
    if (action === "change") {
      if (!validPassword(currentPassword) || !await verifyPassword(currentPassword, credentials?.password ?? null) || !credentials) return json({ error: "invalid_credentials" }, 401);
    } else {
      const recovery = recoveryDigest(recoveryCode);
      const matches = recovery && timingSafeEqual(Buffer.from(recovery, "hex"), Buffer.from(credentials?.recovery ?? "0".repeat(64), "hex"));
      if (!matches || !credentials) return json({ error: "invalid_recovery" }, 401);
    }
    const recovery = newRecoveryCode();
    const profile = store.resetPassword(credentials!, await hashPassword(password), recoveryDigest(recovery)!, digestToken(token));
    setRoadSession(context, token);
    return json({ account: profile, recoveryCode: recovery });
  } catch (error) {
    if (error instanceof RoadNameTakenError) return json({ error: "name_taken" }, 409);
    if (error instanceof RoadAccountError) return json({ error: "invalid_credentials" }, 401);
    if (error instanceof PasswordBusyError) return json({ error: "busy" }, 503);
    return json({ error: "unavailable" }, 503);
  }
};
