import type { APIRoute } from "astro";
import { kladkaStore, setPostStatus } from "../../shared/utils/kladkaStore.ts";
import {
  answerCallback,
  markModerated,
  webhookSecret,
  isModerationEnabled,
  isAdminCallback,
  sendModerationRequest,
} from "../../shared/utils/kladkaTelegram.ts";
import { readJsonObject, RequestBodyError } from "../../server/requestBody.ts";

export const prerender = false;

// Приемник нажатий кнопок «Одобрить / Отклонить» под сообщениями о новых
// записях. Формат тела — апдейт Telegram, но приносит его не Telegram:
// вебхук до нас не доходит, поэтому апдейты забирает long polling'ом
// scripts/kladka-poller.mjs и переотправляет сюда (/BOTS.md §3).

export const POST: APIRoute = async ({ request }) => {
  // Эндпоинт открыт наружу через Caddy, так что подпись обязательна:
  // поллер ставит тот же заголовок, что ставил Telegram.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!isModerationEnabled() || secret !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try {
    update = await readJsonObject(request, 65536);
  } catch (error) {
    return new Response("bad request", { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  if (update.action === "deliver_pending") {
    try {
      const result = await kladkaStore().deliverNext(sendModerationRequest);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch { return new Response("Book unavailable", { status: 503 }); }
  }

  const cb = update?.callback_query;
  // Отвечаем 200 на всё: Telegram иначе будет ретраить незнакомые апдейты.
  if (!cb?.data || !cb.message) return new Response("ok");
  // Ignore unauthorized Telegram users without blocking the poller's update queue.
  try { if (!await isAdminCallback(cb)) return new Response("ok"); }
  catch { return new Response("Moderator authorization unavailable", { status: 503 }); }

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
