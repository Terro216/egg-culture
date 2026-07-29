import crypto from "node:crypto";
import type { KladkaPost } from "./kladkaStore";

// Модерация Книги Кладки через Telegram-бота: каждая новая запись
// прилетает админу сообщением с кнопками «Одобрить / Отклонить»,
// ответ приходит webhook'ом на /api/kladka-telegram.
//
// Настройка: KLADKA_BOT_TOKEN (у @BotFather) и KLADKA_ADMIN_CHAT_ID в .env.
// Webhook настраивается автоматически при первой отправке на модерацию.
// Без токена бот отключен — записи публикуются сразу (режим разработки).

const env = (key: string) =>
  process.env[key] ?? (import.meta.env[key] as string | undefined);

export const botToken = () => env("KLADKA_BOT_TOKEN");
export const adminChatId = () => env("KLADKA_ADMIN_CHAT_ID");

export const isModerationEnabled = () => Boolean(botToken() && adminChatId());

// Секрет webhook'а: свой из .env или производный от токена бота.
export function webhookSecret(): string {
  const explicit = env("KLADKA_WEBHOOK_SECRET");
  if (explicit) return explicit;
  return crypto
    .createHash("sha256")
    .update(`kladka-webhook:${botToken() ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

const api = (method: string) =>
  `https://api.telegram.org/bot${botToken()}/${method}`;

async function call(method: string, body: FormData | object): Promise<any> {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        };
  const res = await fetch(api(method), {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) {
    console.warn(`Telegram ${method} failed:`, data?.description ?? res.status);
  }
  return data;
}

// Webhook ставим лениво и один раз на процесс: setWebhook идемпотентен.
let webhookReady: Promise<void> | null = null;

function siteOrigin(): string {
  const domain = env("DOMAIN");
  return domain ? `https://egg.${domain}` : "https://egg.ilyamedve.dev";
}

function ensureWebhook(): Promise<void> {
  if (!webhookReady) {
    webhookReady = call("setWebhook", {
      url: `${siteOrigin()}/api/kladka-telegram`,
      secret_token: webhookSecret(),
      allowed_updates: ["callback_query"],
    }).then(() => undefined);
  }
  return webhookReady;
}

function moderationCaption(post: KladkaPost): string {
  const date = new Date(post.createdAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
  });
  const style = post.style ? `\nСтиль: ${post.style}` : "";
  return (
    `📖 Новая запись в Книге Кладки\n\n` +
    `От: ${post.name}${style}\n${date} · ip:${post.ipHash.slice(0, 8)}\n\n` +
    `${post.text}`
  ).slice(0, 1000);
}

const moderationKeyboard = (postId: string) => ({
  inline_keyboard: [
    [
      { text: "✅ Одобрить", callback_data: `approve:${postId}` },
      { text: "🗑 Отклонить", callback_data: `reject:${postId}` },
    ],
  ],
});

function mediaForm(post: KladkaPost, image: Buffer, field: string): FormData {
  const form = new FormData();
  form.append("chat_id", adminChatId()!);
  form.append("caption", moderationCaption(post));
  form.append("reply_markup", JSON.stringify(moderationKeyboard(post.id)));
  form.append(
    field,
    new Blob([new Uint8Array(image)], { type: post.image!.type }),
    `post.${post.image!.ext}`,
  );
  return form;
}

export async function sendModerationRequest(
  post: KladkaPost,
  image: Buffer | null,
): Promise<void> {
  if (!isModerationEnabled()) return;
  await ensureWebhook();

  if (image && post.image) {
    // Telegram может отказаться обрабатывать фото (IMAGE_PROCESS_FAILED и т.п.) —
    // тогда шлем файлом, а в самом худшем случае текстом: уведомление о новой
    // записи важнее превью, иначе запись зависнет в pending без следа.
    const asPhoto = await call("sendPhoto", mediaForm(post, image, "photo"));
    if (asPhoto?.ok) return;
    const asDocument = await call(
      "sendDocument",
      mediaForm(post, image, "document"),
    );
    if (asDocument?.ok) return;
  }

  await call("sendMessage", {
    chat_id: adminChatId(),
    text:
      moderationCaption(post) +
      (post.image ? "\n\n⚠️ Фото не удалось приложить — оно сохранено и появится в Книге после одобрения." : ""),
    reply_markup: moderationKeyboard(post.id),
  });
}

export async function answerCallback(callbackId: string, text: string) {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text });
}

// Убираем кнопки и дописываем вердикт в сообщение модерации.
export async function markModerated(
  chatId: string | number,
  messageId: number,
  hasPhoto: boolean,
  originalText: string,
  verdict: string,
) {
  const text = `${originalText}\n\n${verdict}`;
  if (hasPhoto) {
    await call("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: text.slice(0, 1024),
    });
  } else {
    await call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4096),
    });
  }
}
