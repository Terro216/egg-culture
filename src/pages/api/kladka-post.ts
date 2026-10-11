import type { APIContext, APIRoute } from "astro";
import { kladkaStore, KladkaQuotaError, hashIp, sniffImage, KLADKA_LIMITS } from "../../shared/utils/kladkaStore.ts";
import { isModerationEnabled } from "../../shared/utils/kladkaTelegram.ts";
import { allowRequestAttempt, readLimitedBody, RequestBodyError } from "../../server/requestBody.ts";

export const prerender = false;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const invalid = () => json({ error: "invalid_body", message: "Книга не распознала запись." }, 400);

async function createPost({ request, clientAddress }: APIContext) {
  const ipHash = hashIp(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress);
  if (!allowRequestAttempt(`kladka:${ipHash}`)) return json({ error: "rate_limit", message: "Слишком много попыток. Подождите минуту." }, 429);
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return invalid();
  let form: FormData;
  try {
    const bytes = await readLimitedBody(request, KLADKA_LIMITS.bodyMaxBytes, 60000);
    form = await new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    return json({ error: error instanceof RequestBodyError ? error.code : "invalid_body", message: "Книга не распознала запись или файл слишком велик." }, error instanceof RequestBodyError ? error.status : 400);
  }
  const allowed = new Set(["name", "text", "style", "image", "visibility"]);
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (!allowed.has(key) || seen.has(key) || (key !== "image" && typeof value !== "string")) return invalid();
    seen.add(key);
  }
  const name = String(form.get("name") ?? "").trim().slice(0, KLADKA_LIMITS.nameMax) || "Безымянный Адепт";
  const text = String(form.get("text") ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  const style = String(form.get("style") ?? "").trim().slice(0, 60) || undefined;
  const visibility = form.get("visibility") ?? "public";
  if (visibility !== "public" && visibility !== "adepts") return json({ error: "invalid_visibility" }, 400);
  const file = form.get("image");
  if (file !== null && !(file instanceof File)) return invalid();
  if (!text && !(file instanceof File && file.size > 0)) return json({ error: "empty", message: "Запись пуста: нужен текст или фотография." }, 400);
  if (text.length > KLADKA_LIMITS.textMax) return json({ error: "text_length", message: `Книга принимает до ${KLADKA_LIMITS.textMax} знаков.` }, 400);
  let image: Buffer | null = null, imageMeta;
  if (file instanceof File && file.size > 0) {
    if (file.size > KLADKA_LIMITS.imageMaxBytes) return json({ error: "too_large", message: "Фотография тяжелее 5 МБ." }, 413);
    image = Buffer.from(await file.arrayBuffer()); imageMeta = sniffImage(image);
    if (!imageMeta) return json({ error: "image_format", message: "Книга принимает только JPEG, PNG, WebP или GIF." }, 400);
  }
  try {
    const moderation = isModerationEnabled();
    const post = await kladkaStore().createPost({ name, text, style, visibility, image: imageMeta ?? undefined, ipHash }, image, moderation);
    return json({ status: post.status, message: moderation ? "Запись сохранена для Хранителя Книги. Она появится после одобрения." : "Запись легла в Книгу." });
  } catch (error) {
    if (error instanceof KladkaQuotaError) return json({ error: "daily_limit", message: "Три записи в день — предел. Тепло не терпит жадности." }, 429);
    console.error("[kladka] post persistence failed");
    return json({ error: "unavailable", message: "Книга временно недоступна. Попробуйте позже." }, 503);
  }
}

let activeUploads = 0;
export const POST: APIRoute = async context => {
  if (activeUploads >= 4) return json({ error: "busy", message: "Книга занята. Попробуйте немного позже." }, 503);
  activeUploads++;
  try { return await createPost(context); } finally { activeUploads--; }
};
