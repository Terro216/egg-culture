import type { APIRoute } from "astro";
import { eventItems, shopItems } from "../data/content";

// Тайные маршруты (/quiz, /dark-side, /dark-side/fonin) в карту не входят —
// туда ведет только Инициация.
const STATIC_ROUTES = [
  "",
  "manifesto",
  "guide",
  "vintages",
  "tools",
  "prophecy",
  "shop",
  "blog",
  "events",
  "tasting-sheet",
  "egg-type",
  "kladka",
  "incubator",
];

const LANGS = ["ru", "en"] as const;

// Слаги статей одинаковы в ru/en — берем русскую директорию как источник истины.
const blogSlugs = Object.keys(import.meta.glob("../data/blog/ru/*.md")).map(
  (path) => path.split("/").pop()!.replace(".md", ""),
);

function urlEntry(base: URL, route: string): string {
  const path = route ? `/${route}/` : "/";
  const alternates = LANGS.map(
    (l) =>
      `    <xhtml:link rel="alternate" hreflang="${l}" href="${new URL(`/${l}${path}`, base).href}"/>`,
  ).join("\n");
  const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${new URL(`/ru${path}`, base).href}"/>`;

  return LANGS.map(
    (lang) =>
      [
        "  <url>",
        `    <loc>${new URL(`/${lang}${path}`, base).href}</loc>`,
        alternates,
        xDefault,
        "  </url>",
      ].join("\n"),
  ).join("\n");
}

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://egg.ilyamedve.dev/");

  const routes = [
    ...STATIC_ROUTES,
    ...blogSlugs.map((slug) => `blog/${slug}`),
    ...eventItems.map((item) => `events/${item.slug}`),
    ...shopItems.map((item) => `shop/${item.slug}`),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...routes.map((route) => urlEntry(base, route)),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
