import type { APIRoute } from "astro";
import { getPost, readImage, postVisibility } from "../../shared/utils/kladkaStore.ts";
import { isKladkaAdept, KLADKA_PRIVATE_HEADERS } from "../../server/kladkaAccess.ts";

export const prerender = false;

// Фотографии Книги Кладки. Отдаём только снимки одобренных записей:
// всё остальное для внешнего мира не существует.

export const GET: APIRoute = async context => {
  const { url } = context;
  const id = url.searchParams.get("id") ?? "";
  const post = await getPost(id);

  if (!post || post.status !== "approved" || !post.image || (postVisibility(post) === "adepts" && !isKladkaAdept(context))) {
    return new Response("Not found", { status: 404, headers: KLADKA_PRIVATE_HEADERS });
  }

  const buffer = await readImage(post.id, post.image.ext);
  if (!buffer) return new Response("Not found", { status: 404, headers: KLADKA_PRIVATE_HEADERS });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": post.image.type,
      ...KLADKA_PRIVATE_HEADERS,
    },
  });
};
