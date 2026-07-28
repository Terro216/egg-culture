import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyFoninGiftToken } from "@shared/utils/foninGiftToken";

export const prerender = false;

// process.env — первым: import.meta.env инлайнится Vite на этапе сборки,
// а .env в Docker-образ не попадает (секреты приходят через env_file в рантайме).
const accessWord =
  process.env.FONIN_ACCESS_WORD ??
  import.meta.env.FONIN_ACCESS_WORD ??
  "Яй Ци";
const tokenSecret =
  process.env.FONIN_GIFT_TOKEN_SECRET ??
  import.meta.env.FONIN_GIFT_TOKEN_SECRET ??
  accessWord;
const privateDir =
  process.env.FONIN_GIFT_PRIVATE_DIR ??
  import.meta.env.FONIN_GIFT_PRIVATE_DIR ??
  join(process.cwd(), "private", "fonin-gifts");

const giftFiles: Record<string, { fileName: string; contentType: string }> = {
  "first-steep": { fileName: "gift-1.png", contentType: "image/png" },
  "second-dome": { fileName: "gift-2.png", contentType: "image/png" },
};

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const GET: APIRoute = async ({ url }) => {
  const giftId = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const giftFile = giftFiles[giftId];

  if (!giftFile || !token) {
    return text("Дар не найден.", 404);
  }

  const tokenIsValid = await verifyFoninGiftToken(giftId, token, tokenSecret);

  if (!tokenIsValid) {
    return text("Ссылка на дар истекла или не принадлежит этой печати.", 403);
  }

  try {
    const file = await readFile(join(privateDir, giftFile.fileName));
    const body = new Uint8Array(file.byteLength);
    body.set(file);

    return new Response(body.buffer, {
      headers: {
        "Content-Type": giftFile.contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${giftFile.fileName}"`,
      },
    });
  } catch {
    return text("Файл дара пока не положен в приватное хранилище.", 404);
  }
};
