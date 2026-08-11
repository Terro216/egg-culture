import crypto from "node:crypto";

// Модерация Книги Кладки на long polling: сервер сам ходит в Telegram за
// нажатиями кнопок «Одобрить / Отклонить» вместо того, чтобы ждать webhook.
//
// Почему не webhook: с big-one путь к Telegram режется в обе стороны (разбор —
// /BOTS.md §3). Исходящее направление вылечено пином api.telegram.org в
// docker-compose.yml, входящее — нет: Telegram не может открыть соединение с
// нашим Caddy и получает connection timeout, нажатия копятся у него в очереди.
// Поллер разворачивает канал в ту сторону, которая работает.
//
// Апдейт разбирается не здесь: он переотправляется на /api/kladka-telegram —
// тот самый эндпоинт, который раньше дергал Telegram. Так логика модерации
// остается в одном месте, а posts.json пишет по-прежнему один процесс.

const LONG_POLL_SECONDS = 25;
const RETRY_DELAY_MS = 5_000;
const DELIVERY_ATTEMPTS = 5;

const token = () => process.env.KLADKA_BOT_TOKEN;

const endpoint = () =>
  process.env.KLADKA_CALLBACK_URL ??
  `http://127.0.0.1:${process.env.PORT ?? 4321}/api/kladka-telegram`;

// Повторяет webhookSecret() из src/shared/utils/kladkaTelegram.ts: эндпоинт
// проверяет у нас тот же заголовок, что проверял бы у Telegram.
function secret() {
  return (
    process.env.KLADKA_WEBHOOK_SECRET ??
    crypto
      .createHash("sha256")
      .update(`kladka-webhook:${token() ?? ""}`)
      .digest("hex")
      .slice(0, 32)
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, body, timeoutMs) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return await res.json().catch(() => null);
}

// Отдаем апдейт своему же эндпоинту. Сразу после старта контейнера preview еще
// не слушает порт, поэтому несколько попыток с нарастающей паузой — это норма,
// а не отказ.
async function deliver(update) {
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": secret(),
        },
        body: JSON.stringify(update),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return true;
      console.warn(`[kladka-poller] эндпоинт ответил ${res.status}`);
    } catch (err) {
      console.warn(`[kladka-poller] эндпоинт недоступен: ${err.message}`);
    }
    await sleep(attempt * 2_000);
  }
  return false;
}

export async function startPolling() {
  if (!token() || !process.env.KLADKA_ADMIN_CHAT_ID) {
    console.log("[kladka-poller] бот не настроен — модерация выключена");
    return;
  }

  // Webhook и getUpdates взаимоисключающи: пока стоит webhook, getUpdates
  // отвечает 409. Накопленные нажатия при этом не теряются — drop_pending_updates
  // по умолчанию false, и очередь приедет первым же ответом.
  await api("deleteWebhook", {}, 15_000).catch((err) =>
    console.warn(`[kladka-poller] deleteWebhook: ${err.message}`),
  );
  console.log(`[kladka-poller] слушаю обновления, ответы шлю на ${endpoint()}`);

  let offset = 0;
  for (;;) {
    try {
      const data = await api(
        "getUpdates",
        {
          offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ["callback_query"],
        },
        (LONG_POLL_SECONDS + 10) * 1_000,
      );

      if (!data?.ok) {
        console.warn(
          `[kladka-poller] getUpdates: ${data?.description ?? "нет ответа"}`,
        );
        // 409 — webhook кто-то поставил заново; снимаем и продолжаем.
        if (data?.error_code === 409) {
          await api("deleteWebhook", {}, 15_000).catch(() => {});
        }
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      for (const update of data.result ?? []) {
        if (!(await deliver(update))) {
          // Дальше держать очередь заблокированной нельзя: следующие нажатия
          // застрянут за этим. Теряем одно решение — админ нажмет еще раз.
          console.error(
            `[kladka-poller] апдейт ${update.update_id} не доставлен, пропускаю`,
          );
        }
        // Сдвиг offset подтверждает апдейт: до этого момента Telegram отдаст
        // его снова, даже если процесс упадет.
        offset = update.update_id + 1;
      }
    } catch (err) {
      console.warn(`[kladka-poller] ${err.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}
