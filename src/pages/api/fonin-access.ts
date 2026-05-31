import type { APIRoute } from "astro";

export const prerender = false;

const accessWord = import.meta.env.FONIN_ACCESS_WORD ?? "Яй Ци";

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'.!,?:;()\-—–]/g, "")
    .replace(/\s+/g, " ");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const POST: APIRoute = async ({ request }) => {
  let body: { accessWord?: unknown };

  try {
    body = await request.json();
  } catch {
    return json({ message: "Кладка не распознала запрос." }, 400);
  }

  if (typeof body.accessWord !== "string") {
    return json({ message: "Кодовое слово не передано." }, 400);
  }

  if (normalize(body.accessWord) !== normalize(accessWord)) {
    return json({ message: "Кодовое слово не совпало с вибрацией кладки." }, 403);
  }

  return json({ ok: true });
};
