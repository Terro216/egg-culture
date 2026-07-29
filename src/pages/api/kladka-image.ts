import type { APIRoute } from "astro";
import { getPost, readImage } from "@shared/utils/kladkaStore";

export const prerender = false;

// Фотографии Книги Кладки. Отдаём только снимки одобренных записей:
// всё остальное для внешнего мира не существует.

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id") ?? "";
  const post = await getPost(id);

  if (!post || post.status !== "approved" || !post.image) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await readImage(post.id, post.image.ext);
  if (!buffer) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": post.image.type,
      "Cache-Control": "public, max-age=86400",
    },
  });
};
