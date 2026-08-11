import type { APIRoute } from "astro";
import { setPostStatus } from "@shared/utils/kladkaStore";
import {
  answerCallback,
  markModerated,
  webhookSecret,
} from "@shared/utils/kladkaTelegram";

export const prerender = false;

// Приемник нажатий кнопок «Одобрить / Отклонить» под сообщениями о новых
// записях. Формат тела — апдейт Telegram, но приносит его не Telegram:
// вебхук до нас не доходит, поэтому апдейты забирает long polling'ом
// scripts/kladka-poller.mjs и переотправляет сюда (/BOTS.md §3).

export const POST: APIRoute = async ({ request }) => {
  // Эндпоинт открыт наружу через Caddy, так что подпись обязательна:
  // поллер ставит тот же заголовок, что ставил Telegram.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const cb = update?.callback_query;
  // Отвечаем 200 на всё: Telegram иначе будет ретраить незнакомые апдейты.
  if (!cb?.data || !cb.message) return new Response("ok");

  const [action, postId] = String(cb.data).split(":");
  if ((action !== "approve" && action !== "reject") || !postId) {
    await answerCallback(cb.id, "Неизвестное действие");
    return new Response("ok");
  }

  const post = await setPostStatus(
    postId,
    action === "approve" ? "approved" : "rejected",
  );

  if (!post) {
    await answerCallback(cb.id, "Запись не найдена");
    return new Response("ok");
  }

  const verdict =
    post.status === "approved" ? "✅ Одобрено — запись в Книге" : "🗑 Отклонено";
  await answerCallback(cb.id, verdict);
  await markModerated(
    cb.message.chat.id,
    cb.message.message_id,
    Boolean(cb.message.photo || cb.message.document),
    cb.message.caption ?? cb.message.text ?? "",
    verdict,
  );

  return new Response("ok");
};
