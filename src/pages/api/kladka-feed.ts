import type { APIRoute } from "astro";
import { getApprovedPosts, visibleKladkaEntries } from "../../shared/utils/kladkaStore.ts";
import { isKladkaAdept, KLADKA_PRIVATE_HEADERS } from "../../server/kladkaAccess.ts";

export const prerender = false;
export const GET: APIRoute = async context => {
  try {
    const posts = visibleKladkaEntries(await getApprovedPosts(100), isKladkaAdept(context));
    return Response.json({ posts }, { headers: KLADKA_PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: KLADKA_PRIVATE_HEADERS });
  }
};
