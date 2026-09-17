import type { APIRoute } from "astro";
export const prerender = true;
export function getStaticPaths() { return [{ params: { lang: "ru" } }, { params: { lang: "en" } }]; }
export const GET: APIRoute = ({ params }) => new Response(JSON.stringify({
  id: `/${params.lang}/play/`,
  name: params.lang === "ru" ? "Путь формы" : "Path of Form",
  short_name: params.lang === "ru" ? "Путь формы" : "Path of Form",
  lang: params.lang,
  start_url: `/${params.lang}/play/`,
  scope: `/${params.lang}/play/`,
  display: "standalone",
  background_color: "#17131e",
  theme_color: "#17131e",
  icons: [192, 512].map(size => ({ src: `/egg-road-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
}), { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
