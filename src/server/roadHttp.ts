import type { APIContext } from "astro";
import { digestToken, newSessionToken } from "./roadPasswords.ts";
import { roadRecordStore, ROAD_SESSION_SECONDS } from "./roadRecords.ts";

export const ROAD_GUEST_COOKIE = "egg_road_player";
export const ROAD_SESSION_COOKIE = import.meta.env?.DEV ? "egg_road_session_dev" : "__Host-egg_road_session";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: !import.meta.env?.DEV, path: "/" };
export const roadJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
});
export const roadIp = (context: APIContext) => digestToken(context.request.headers.get("x-forwarded-for")?.split(",")[0].trim() || context.clientAddress);
const limits = new Map<string, { until: number; count: number }>();
export function allowRoadRequest(context: APIContext, action: "read" | "write") {
  const now = Date.now();
  for (const [key, item] of limits) if (item.until < now) limits.delete(key);
  const key = `${action}:${roadIp(context)}`;
  const item = limits.get(key) ?? { until: now + 60000, count: 0 };
  if (!limits.has(key) && limits.size >= 10000) return false;
  limits.set(key, item);
  return ++item.count <= (action === "read" ? 120 : 20);
}
export function guestRoadPlayer(context: APIContext, rotate = false) {
  let token = context.cookies.get(ROAD_GUEST_COOKIE)?.value;
  // A legacy guest cookie must never authorize its owner after registration.
  if (rotate || !token || !/^[a-f0-9]{64}$/.test(token) || roadRecordStore().registered(digestToken(token))) {
    token = newSessionToken();
    context.cookies.set(ROAD_GUEST_COOKIE, token, { ...cookieOptions, maxAge: 31536000 });
  }
  return digestToken(token);
}
export function sessionRoadPlayer(context: APIContext) {
  const token = context.cookies.get(ROAD_SESSION_COOKIE)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? roadRecordStore().session(digestToken(token)) : null;
}
export const roadPlayer = (context: APIContext) => sessionRoadPlayer(context) ?? guestRoadPlayer(context);
export function setRoadSession(context: APIContext, token: string) {
  context.cookies.set(ROAD_SESSION_COOKIE, token, { ...cookieOptions, maxAge: ROAD_SESSION_SECONDS });
}
export function clearRoadSession(context: APIContext) {
  const token = context.cookies.get(ROAD_SESSION_COOKIE)?.value;
  if (token) roadRecordStore().logout(digestToken(token));
  context.cookies.delete(ROAD_SESSION_COOKIE, { ...cookieOptions });
}
export function checkRoadWrite(context: APIContext) {
  const origin = context.request.headers.get("origin");
  if (origin !== context.site?.origin && !(import.meta.env?.DEV && origin === context.url.origin)) return roadJson({ error: "origin" }, 403);
  if (context.request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return roadJson({ error: "content_type" }, 415);
  return null;
}
export async function readRoadBody(request: Request): Promise<{ value: unknown; error?: never } | { error: Response; value?: never }> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: roadJson({ error: "invalid_body" }, 400) };
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > 8192) { await reader.cancel(); return { error: roadJson({ error: "too_large" }, 413) }; }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch { return { error: roadJson({ error: "invalid_body" }, 400) }; }
}
