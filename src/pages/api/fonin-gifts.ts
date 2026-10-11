import type { APIRoute } from "astro";
import { allowRequestAttempt, readJsonObject, RequestBodyError } from "../../server/requestBody.ts";
import { createFoninGiftToken } from "../../shared/utils/foninGiftToken.ts";

export const prerender = false;

type GiftSecret = {
  stage: number;
  certificate?: string;
  imageGift?: boolean;
  note: string;
};

// process.env — первым: import.meta.env инлайнится Vite на этапе сборки,
// а .env в Docker-образ не попадает (секреты приходят через env_file в рантайме).
const accessWord =
  process.env.FONIN_ACCESS_WORD ??
  import.meta.env?.FONIN_ACCESS_WORD ??
  "Яй Ци";
const tokenSecret =
  process.env.FONIN_GIFT_TOKEN_SECRET ??
  import.meta.env?.FONIN_GIFT_TOKEN_SECRET ??
  accessWord;

const giftSecrets: Record<string, GiftSecret> = {
  "first-steep": {
    stage: 1,
    imageGift: true,
    note: "Первая печать открыта. Пролив признан достаточно ровным.",
  },
  "second-dome": {
    stage: 2,
    imageGift: true,
    note: "Вторая печать открыта. Заберите то, что было скрыто до верного движения.",
  },
  "third-yolk": {
    stage: 3,
    certificate:
      "Этот подарок украл чайный гномик. Но мы обязательно поймаем его и через суд получим всё обратно. Думаю, управимся к следующей встрече.",
    note: "Третья печать открыта. Оракул зафиксировал следы маленьких чайных ног.",
  },
};

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

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress;
  if (!allowRequestAttempt(`fonin:${ip}`, 30, 15 * 60000)) return json({ error: "rate_limit", message: "Подождите перед следующей попыткой." }, 429);
  let body: {
    giftId?: unknown;
    accessWord?: unknown;
    ritual?: { stage?: unknown; score?: unknown; axis?: unknown };
  };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return json({ error: error instanceof RequestBodyError ? error.code : "invalid_body", message: "Хранилище не распознало запрос." }, error instanceof RequestBodyError ? error.status : 400);
  }

  if (typeof body.giftId !== "string" || typeof body.accessWord !== "string") {
    return json({ message: "Форма дара неполная." }, 400);
  }

  if (normalize(body.accessWord) !== normalize(accessWord)) {
    return json({ message: "Код Основателя не принят." }, 403);
  }

  const gift = Object.hasOwn(giftSecrets, body.giftId) ? giftSecrets[body.giftId] : null;

  if (!gift) {
    return json({ message: "Такого дара нет в кладке." }, 404);
  }

  if (!body.ritual || body.ritual.stage !== gift.stage) {
    return json({ message: "Печати нужно раскрывать по порядку." }, 409);
  }

  if (typeof body.ritual.score !== "number" || !Number.isFinite(body.ritual.score) || body.ritual.score < 75 || body.ritual.score > 100) {
    return json({ message: "Пролив получился недостаточно собранным." }, 422);
  }

  if (gift.imageGift) {
    const token = await createFoninGiftToken(body.giftId, tokenSecret);

    return json({
      certificate: `/api/fonin-gift-image?id=${encodeURIComponent(body.giftId)}&token=${encodeURIComponent(token)}`,
      note: gift.note,
    });
  }

  return json({
    certificate: gift.certificate,
    note: gift.note,
  });
};
