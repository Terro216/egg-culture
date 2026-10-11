import type { APIRoute } from "astro";
import { validPortalSlug } from "../../../server/roadRecords.ts";

export const prerender = false;
export const GET: APIRoute = ({ params, url, site }) => {
  const lang = params.lang, id = params.id;
  if ((lang !== "ru" && lang !== "en") || !id || (!/^[a-f0-9]{24}$/.test(id) && !validPortalSlug(id))) return new Response(null, { status: 404 });
  return Response.redirect(new URL(`/${lang}/adepts/${id}/${url.search}`, site ?? url), 308);
};
