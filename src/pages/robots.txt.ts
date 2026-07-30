import type { APIRoute } from "astro";

// Тайные разделы (quiz, dark-side) намеренно не упомянуты:
// строка Disallow сама выдала бы их адреса. Они закрыты noindex-метой.
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://egg.ilyamedve.dev/");
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${new URL("/sitemap.xml", base).href}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
