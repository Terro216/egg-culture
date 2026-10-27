import type { APIRoute } from "astro";
import { allowRequestAttempt, readJsonObject, RequestBodyError } from "../../server/requestBody.ts";

export const prerender = false;

// process.env — первым: import.meta.env инлайнится Vite на этапе сборки,
// а .env в Docker-образ не попадает (секреты приходят через env_file в рантайме).
const accessWord =
  process.env.FONIN_ACCESS_WORD ??
  import.meta.env?.FONIN_ACCESS_WORD ??
  "";

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'.!,?:;()\-—–]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!normalize(accessWord)) return json({ message: "Доступ к дарам не настроен." }, 503);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress;
  if (!allowRequestAttempt(`fonin:${ip}`, 30, 15 * 60000)) return json({ error: "rate_limit", message: "Подождите перед следующей попыткой." }, 429);
  let body: { accessWord?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return json({ error: error instanceof RequestBodyError ? error.code : "invalid_body", message: "Кладка не распознала запрос." }, error instanceof RequestBodyError ? error.status : 400);
  }

  if (typeof body.accessWord !== "string") {
    return json({ message: "Кодовое слово не передано." }, 400);
  }

  if (normalize(body.accessWord) !== normalize(accessWord)) {
    return json({ message: "Кодовое слово не совпало с вибрацией кладки." }, 403);
  }

  return json({ ok: true });
};
