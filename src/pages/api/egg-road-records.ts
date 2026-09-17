import type { APIRoute, APIContext } from "astro";
import { createHash, randomBytes } from "node:crypto";
import { canonicalRoadCode, parsePublishedRun } from "../../features/EggRoad/leaderboard.ts";
import { roadRecordStore, RoadNameTakenError } from "../../server/roadRecords.ts";

export const prerender = false;
const COOKIE = "egg_road_player";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
});
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const limits = new Map<string, { until: number; count: number }>();
function allowed(context: APIContext, action: "read" | "write") {
  const now = Date.now();
  for (const [key, item] of limits) if (item.until < now) limits.delete(key);
  const ip = context.request.headers.get("x-forwarded-for")?.split(",")[0].trim() || context.clientAddress;
  const key = `${action}:${digest(ip)}`;
  const item = limits.get(key) ?? { until: now + 60000, count: 0 };
  if (!limits.has(key) && limits.size >= 10000) return false;
  limits.set(key, item);
  return ++item.count <= (action === "read" ? 120 : 20);
}
function player(context: APIContext) {
  let token = context.cookies.get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = randomBytes(32).toString("hex");
    context.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: !import.meta.env?.DEV, path: "/", maxAge: 31536000 });
  }
  return digest(token);
}
export const GET: APIRoute = async context => {
  if (!allowed(context, "read")) return json({ error: "rate_limit" }, 429);
  if (context.url.searchParams.get("view") === "popular") {
    const filter = context.url.searchParams.get("mode") ?? "all";
    if (!["all", "finite", "endless"].includes(filter)) return json({ error: "invalid_mode" }, 400);
    try { return json(roadRecordStore().popular(filter as "all" | "finite" | "endless")); }
    catch { return json({ error: "unavailable" }, 503); }
  }
  const code = canonicalRoadCode(context.url.searchParams.get("code"));
  if (!code) return json({ error: "invalid_code" }, 400);
  try { return json(roadRecordStore().read(code, player(context))); }
  catch { return json({ error: "unavailable" }, 503); }
};
export const POST: APIRoute = async context => {
  const { request, site } = context;
  const origin = request.headers.get("origin");
  if (origin !== site?.origin && !(import.meta.env?.DEV && origin === context.url.origin)) return json({ error: "origin" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "content_type" }, 415);
  if (!allowed(context, "write")) return json({ error: "rate_limit" }, 429);
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "invalid_run" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > 8192) { await reader.cancel(); return json({ error: "too_large" }, 413); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "invalid_run" }, 400); }
  const run = parsePublishedRun(value);
  if (!run) return json({ error: "invalid_run" }, 400);
  try { return json(roadRecordStore().submit(player(context), run)); }
  catch (error) { return json({ error: error instanceof RoadNameTakenError ? "name_taken" : "unavailable" }, error instanceof RoadNameTakenError ? 409 : 503); }
};
