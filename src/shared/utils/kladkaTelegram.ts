import crypto from "node:crypto";
import type { KladkaPost } from "./kladkaStore.ts";
import { postVisibility } from "./kladkaStore.ts";

// Модерация Книги Кладки через Telegram-бота: каждая новая запись
// прилетает админу сообщением с кнопками «Одобрить / Отклонить».
//
// Ответ забирает long polling'ом scripts/kladka-poller.mjs и переотправляет
// на /api/kladka-telegram; входящий публичный webhook не требуется.
//
// Настройка: KLADKA_BOT_TOKEN (у @BotFather) и KLADKA_ADMIN_CHAT_ID в .env.
// Без токена бот отключен — записи публикуются сразу (режим разработки).

const env = (key: string) =>
  process.env[key] ?? (import.meta.env?.[key] as string | undefined);

export const botToken = () => env("KLADKA_BOT_TOKEN");
export const adminChatId = () => env("KLADKA_ADMIN_CHAT_ID");

export const isModerationEnabled = () => Boolean(botToken() && adminChatId());

export async function isAdminCallback(callback: { from?: { id?: unknown }; message?: { chat?: { id?: unknown } } }) {
  const chat = adminChatId();
  if (!chat || String(callback.message?.chat?.id) !== chat) return false;
  const user = String(callback.from?.id);
  if (!/^\d+$/.test(user)) return false;
  const delegated = env("KLADKA_ADMIN_USER_IDS");
  if (delegated) return delegated.split(",").map(id => id.trim()).includes(user);
  if (!chat.startsWith("-")) return user === chat;
  // Existing group setups need no new setting: Telegram's own administrators
  // remain moderators. A transport failure is retryable, not a rejected update.
  const member = await call("getChatMember", { chat_id: chat, user_id: Number(user) });
  if (!member) throw new Error("Moderator authorization unavailable");
  return ["creator", "administrator"].includes(member.result?.status);
}

// Секрет, которым подписан вызов /api/kladka-telegram: свой из .env или
// производный от токена бота. Ту же формулу повторяет поллер.
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
  try {
    const res = await fetch(api(method), { ...init, signal: AbortSignal.timeout(15_000) });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) return data;
    console.warn(`Telegram ${method} failed: HTTP_${res.status}`);
  } catch { console.warn(`Telegram ${method} failed: transport_error`); }
  return null;
}

function moderationCaption(post: KladkaPost): string {
  const date = new Date(post.createdAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
  });
  const style = post.style ? `\nСтиль: ${post.style}` : "";
  const visibility = postVisibility(post) === "adepts" ? "Только адептам" : "Для всех";
  return (
    `📖 Новая запись в Книге Кладки\n\n` +
    `От: ${post.name}${style}\nКто увидит: ${visibility}\n${date} · ip:${post.ipHash.slice(0, 8)}\n\n` +
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

  const message = await call("sendMessage", {
    chat_id: adminChatId(),
    text:
      moderationCaption(post) +
      (post.image ? "\n\n⚠️ Фото не удалось приложить — оно сохранено и появится в Книге после одобрения." : ""),
    reply_markup: moderationKeyboard(post.id),
  });
  if (!message?.ok) throw new Error("Moderation delivery failed");
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
