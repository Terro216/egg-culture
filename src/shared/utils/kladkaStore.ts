import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Книга Кладки: записи адептов с фотографиями завтраков.
// Живет в отдельной директории (.kladka), которая в Docker монтируется
// volume'ом — записи переживают redeploy. Ничего не удаляем никогда:
// отклонённые записи остаются в файле со статусом rejected.

const DATA_DIR = path.resolve(
  process.cwd(),
  process.env.KLADKA_DATA_DIR ?? ".kladka",
);
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const IMAGES_DIR = path.join(DATA_DIR, "images");

export type KladkaStatus = "pending" | "approved" | "rejected";

export interface KladkaPost {
  id: string;
  name: string;
  text: string;
  style?: string;
  image?: { ext: string; type: string };
  ipHash: string;
  createdAt: string; // ISO
  status: KladkaStatus;
  moderatedAt?: string;
}

interface KladkaData {
  posts: KladkaPost[];
}

export const KLADKA_LIMITS = {
  textMax: 500,
  nameMax: 40,
  imageMaxBytes: 5 * 1024 * 1024,
  postsPerDay: 3,
};

// Разрешенные форматы: определяем по магическим байтам, а не по заголовкам.
const IMAGE_SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { ext: "png", type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    ext: "webp",
    type: "image/webp",
    test: (b) =>
      b.length > 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  { ext: "gif", type: "image/gif", test: (b) => b.toString("ascii", 0, 4) === "GIF8" },
];

export function sniffImage(buffer: Buffer): { ext: string; type: string } | null {
  const match = IMAGE_SIGNATURES.find((s) => s.test(buffer));
  return match ? { ext: match.ext, type: match.type } : null;
}

export function hashIp(ip: string): string {
  const salt =
    process.env.KLADKA_IP_SALT ??
    process.env.FONIN_GIFT_TOKEN_SECRET ??
    "kladka-salt";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 16);
}

async function readData(): Promise<KladkaData> {
  try {
    const raw = await fs.readFile(POSTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.posts)) return parsed as KladkaData;
  } catch {
    // первого запуска файла нет — это нормально
  }
  return { posts: [] };
}

// Атомарная запись: tmp + rename (см. newsCache).
async function writeData(data: KladkaData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${POSTS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, POSTS_FILE);
}

// Все мутации — через одну очередь: каждая заново читает файл,
// применяет правку и пишет результат (иначе last writer wins).
let updateQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: (data: KladkaData) => T): Promise<T> {
  const run = updateQueue.catch(() => {}).then(async () => {
    const data = await readData();
    const result = task(data);
    await writeData(data);
    return result;
  });
  updateQueue = run;
  return run;
}

export async function addPost(
  post: Omit<KladkaPost, "id" | "createdAt" | "status">,
): Promise<KladkaPost> {
  const full: KladkaPost = {
    ...post,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await enqueue((data) => {
    data.posts.push(full);
  });
  return full;
}

export async function setPostStatus(
  id: string,
  status: KladkaStatus,
): Promise<KladkaPost | null> {
  return enqueue((data) => {
    const post = data.posts.find((p) => p.id === id);
    if (!post) return null;
    // Решение по записи принимается один раз.
    if (post.status !== "pending") return post;
    post.status = status;
    post.moderatedAt = new Date().toISOString();
    return post;
  });
}

export async function getApprovedPosts(limit = 100): Promise<KladkaPost[]> {
  const data = await readData();
  return data.posts
    .filter((p) => p.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getPost(id: string): Promise<KladkaPost | null> {
  const data = await readData();
  return data.posts.find((p) => p.id === id) ?? null;
}

export async function countPostsToday(ipHash: string): Promise<number> {
  const data = await readData();
  const today = new Date().toISOString().slice(0, 10);
  return data.posts.filter(
    (p) => p.ipHash === ipHash && p.createdAt.slice(0, 10) === today,
  ).length;
}

export async function saveImage(id: string, ext: string, buffer: Buffer) {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.join(IMAGES_DIR, `${id}.${ext}`), buffer);
}

export async function readImage(
  id: string,
  ext: string,
): Promise<Buffer | null> {
  // id приходит из нашего же файла записей, но на всякий случай
  // не позволяем ничего похожего на путь.
  if (!/^[a-f0-9-]+$/.test(id) || !/^[a-z]+$/.test(ext)) return null;
  try {
    return await fs.readFile(path.join(IMAGES_DIR, `${id}.${ext}`));
  } catch {
    return null;
  }
}
