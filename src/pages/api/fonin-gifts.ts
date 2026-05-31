import type { APIRoute } from "astro";
import { createFoninGiftToken } from "@shared/utils/foninGiftToken";

export const prerender = false;

type GiftSecret = {
  stage: number;
  certificate?: string;
  imageGift?: boolean;
  note: string;
};

const accessWord = import.meta.env.FONIN_ACCESS_WORD ?? "Яй Ци";
const tokenSecret = import.meta.env.FONIN_GIFT_TOKEN_SECRET ?? accessWord;

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

export const POST: APIRoute = async ({ request }) => {
  let body: {
    giftId?: unknown;
    accessWord?: unknown;
    ritual?: { stage?: unknown; score?: unknown; axis?: unknown };
  };

  try {
    body = await request.json();
  } catch {
    return json({ message: "Хранилище не распознало запрос." }, 400);
  }

  if (typeof body.giftId !== "string" || typeof body.accessWord !== "string") {
    return json({ message: "Форма дара неполная." }, 400);
  }

  if (normalize(body.accessWord) !== normalize(accessWord)) {
    return json({ message: "Код Основателя не принят." }, 403);
  }

  const gift = giftSecrets[body.giftId];

  if (!gift) {
    return json({ message: "Такого дара нет в кладке." }, 404);
  }

  if (!body.ritual || body.ritual.stage !== gift.stage) {
    return json({ message: "Печати нужно раскрывать по порядку." }, 409);
  }

  if (typeof body.ritual.score !== "number" || body.ritual.score < 75) {
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
