import type { APIRoute } from "astro";
import {
  addPost,
  countPostsToday,
  hashIp,
  saveImage,
  sniffImage,
  KLADKA_LIMITS,
} from "@shared/utils/kladkaStore";
import {
  isModerationEnabled,
  sendModerationRequest,
} from "@shared/utils/kladkaTelegram";
import { setPostStatus } from "@shared/utils/kladkaStore";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

function clientIp(request: Request, fallback: string): string {
  // За Caddy реальный адрес — в X-Forwarded-For (первый в списке).
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return fallback;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ message: "Книга не распознала запись." }, 400);
  }

  const name =
    String(form.get("name") ?? "")
      .trim()
      .slice(0, KLADKA_LIMITS.nameMax) || "Безымянный Адепт";
  const text = String(form.get("text") ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim();
  const style = String(form.get("style") ?? "").trim().slice(0, 60) || undefined;
  const file = form.get("image");

  if (!text && !(file instanceof File && file.size > 0)) {
    return json({ message: "Запись пуста: нужен текст или фотография." }, 400);
  }
  if (text.length > KLADKA_LIMITS.textMax) {
    return json(
      { message: `Слишком длинно: Книга принимает до ${KLADKA_LIMITS.textMax} знаков.` },
      400,
    );
  }

  // Фотография: лимит размера и настоящий формат по магическим байтам.
  let imageBuffer: Buffer | null = null;
  let imageMeta: { ext: string; type: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > KLADKA_LIMITS.imageMaxBytes) {
      return json({ message: "Фотография тяжелее 5 МБ. Книга ценит легкость." }, 400);
    }
    imageBuffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImage(imageBuffer);
    if (!sniffed) {
      return json({ message: "Книга принимает только JPEG, PNG, WebP или GIF." }, 400);
    }
    imageMeta = sniffed;
  }

  const ip = clientIp(request, clientAddress);
  const ipHash = hashIp(ip);
  const postedToday = await countPostsToday(ipHash);
  if (postedToday >= KLADKA_LIMITS.postsPerDay) {
    return json(
      { message: "Три записи в день — предел. Тепло не терпит жадности." },
      429,
    );
  }

  const post = await addPost({
    name,
    text,
    style,
    image: imageMeta,
    ipHash,
  });

  if (imageBuffer && imageMeta) {
    await saveImage(post.id, imageMeta.ext, imageBuffer);
  }

  if (isModerationEnabled()) {
    await sendModerationRequest(post, imageBuffer);
    return json({
      status: "pending",
      message: "Запись отправлена Хранителю Книги. Она появится после одобрения.",
    });
  }

  // Бот не настроен (разработка) — публикуем сразу.
  await setPostStatus(post.id, "approved");
  return json({ status: "approved", message: "Запись легла в Книгу." });
};
