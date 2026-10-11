import type { APIRoute } from "astro";

export const prerender = false;
export const GET: APIRoute = ({ params, url, site }) => {
  const lang = params.lang;
  if (lang !== "ru" && lang !== "en") return new Response(null, { status: 404 });
  return Response.redirect(new URL(`/${lang}/dark-side/${url.search}#games`, site ?? url), 308);
};
