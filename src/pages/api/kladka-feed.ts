import type { APIRoute } from "astro";
import { kladkaFeed } from "../../server/kladkaFeed.ts";
import { KLADKA_PRIVATE_HEADERS } from "../../server/kladkaAccess.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  try {
    return Response.json(await kladkaFeed(context), { headers: KLADKA_PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: KLADKA_PRIVATE_HEADERS });
  }
};
