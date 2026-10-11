import type { APIContext } from "astro";
import { sessionRoadPlayer } from "./roadHttp.ts";
import { roadRecordStore } from "./roadRecords.ts";

// Match the Portal's existing initiation model: cloud status for an account,
// browser initiation for a guest. A guest flag cannot unlock a signed-in novice.
export function isKladkaAdept(context: Pick<APIContext, "cookies">): boolean {
  const player = sessionRoadPlayer(context as APIContext);
  return player ? roadRecordStore().initiated(player) : context.cookies.get("egg_guest_initiated")?.value === "1";
}

export const KLADKA_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};
