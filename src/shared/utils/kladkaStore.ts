import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Книга Кладки: записи адептов с фотографиями завтраков.
// Живет в отдельной директории (.kladka), которая в Docker монтируется
// volume'ом — записи переживают redeploy. Ничего не удаляем никогда:
// отклонённые записи остаются в файле со статусом rejected.

export type KladkaStatus = "pending" | "approved" | "rejected";
export type KladkaVisibility = "public" | "adepts";

// The existing “КАПУСТА” and Кирка entries are restricted by request. Other legacy entries
// remain public; an explicit visibility choice always takes precedence.
const LEGACY_ADEPT_POSTS = new Set([
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
]);
export const postVisibility = (post: Pick<KladkaPost, "id" | "visibility">): KladkaVisibility =>
  post.visibility ?? (LEGACY_ADEPT_POSTS.has(post.id) ? "adepts" : "public");

export interface KladkaPost {
  id: string;
  name: string;
  text: string;
  style?: string;
  image?: { ext: string; type: string };
  ipHash: string;
  createdAt: string; // ISO
  status: KladkaStatus;
  visibility?: KladkaVisibility; // Absent only in legacy files.
  moderatedAt?: string;
  delivery?: { attempts: number; nextAttemptAt: number; deliveredAt?: string };
}

type EntrySummary = Pick<KladkaPost, "id" | "name" | "createdAt"> & { visibility: KladkaVisibility };
export type KladkaEntry = EntrySummary & (
  | { locked: true }
  | { locked: false; text: string; style?: string; image: boolean }
);

/** Only this projection may be serialized to readers; no moderation/IP data. */
export function visibleKladkaEntries(posts: KladkaPost[], adept: boolean): KladkaEntry[] {
  return posts.filter(post => post.status === "approved").map(post => {
    const visibility = postVisibility(post);
    const summary = { id: post.id, name: post.name, createdAt: post.createdAt, visibility };
    if (visibility === "adepts" && !adept) return { ...summary, locked: true };
    return { ...summary, locked: false, text: post.text, style: post.style, image: Boolean(post.image) };
  });
}

interface KladkaData {
  posts: KladkaPost[];
}

export const KLADKA_LIMITS = {
  textMax: 500,
  nameMax: 40,
  imageMaxBytes: 5 * 1024 * 1024,
  postsPerDay: 3,
  bodyMaxBytes: 5 * 1024 * 1024 + 16 * 1024,
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

export class KladkaQuotaError extends Error {}
export class KladkaStorageError extends Error {}
type NewPost = Omit<KladkaPost, "id" | "createdAt" | "status" | "moderatedAt" | "delivery">;
const queues = new Map<string, Promise<unknown>>();

function validPost(value: unknown): value is KladkaPost {
  if (!value || typeof value !== "object") return false;
  const post = value as KladkaPost;
  return typeof post.id === "string" && /^[a-f0-9-]+$/.test(post.id)
    && [post.name, post.text, post.ipHash, post.createdAt].every(field => typeof field === "string")
    && Number.isFinite(Date.parse(post.createdAt)) && ["pending", "approved", "rejected"].includes(post.status)
    && (post.visibility === undefined || post.visibility === "public" || post.visibility === "adepts")
    && (!post.image || (typeof post.image === "object" && IMAGE_SIGNATURES.some(image => image.ext === post.image?.ext && image.type === post.image?.type)))
    && (!post.delivery || (Number.isSafeInteger(post.delivery.attempts) && post.delivery.attempts >= 0
      && Number.isFinite(post.delivery.nextAttemptAt) && (!post.delivery.deliveredAt || Number.isFinite(Date.parse(post.delivery.deliveredAt)))));
}

/** One web process owns this JSON store; all its writers share the directory queue. */
export function createKladkaStore(directory: string) {
  const dataDir = path.resolve(directory), postsFile = path.join(dataDir, "posts.json"), imagesDir = path.join(dataDir, "images");
  async function readData(): Promise<KladkaData> {
    let raw: string;
    try { raw = await fs.readFile(postsFile, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { posts: [] };
      throw new KladkaStorageError("Cannot read the Book");
    }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.posts) || !data.posts.every(validPost)
        || new Set(data.posts.map((post: KladkaPost) => post.id)).size !== data.posts.length) throw new Error("Invalid Book");
      // Read-only normalization takes effect immediately, including image access.
      // The next ordinary write persists it through the existing atomic queue.
      return { ...data, posts: data.posts.map((post: KladkaPost) => ({ ...post, visibility: postVisibility(post) })) };
    } catch { throw new KladkaStorageError("The Book needs recovery; existing data was not changed"); }
  }
  async function writeData(data: KladkaData) {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporary = `${postsFile}.${crypto.randomUUID()}.tmp`;
    try {
      const file = await fs.open(temporary, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(data, null, 2)); await file.sync(); }
      finally { await file.close(); }
      await fs.rename(temporary, postsFile);
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
  function enqueue<T>(task: (data: KladkaData) => T | Promise<T>): Promise<T> {
    const run = (queues.get(dataDir) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const data = await readData();
      const result = await task(data);
      await writeData(data);
      return result;
    });
    queues.set(dataDir, run);
    void run.finally(() => { if (queues.get(dataDir) === run) queues.delete(dataDir); }).catch(() => {});
    return run;
  }
  async function readImage(id: string, ext: string): Promise<Buffer | null> {
    if (!/^[a-f0-9-]+$/.test(id) || !/^[a-z]+$/.test(ext)) return null;
    try { return await fs.readFile(path.join(imagesDir, `${id}.${ext}`)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  return {
    async createPost(post: NewPost, image: Buffer | null, moderation: boolean, now = Date.now()): Promise<KladkaPost> {
      const full: KladkaPost = { ...post, visibility: post.visibility ?? "public", id: crypto.randomUUID(), createdAt: new Date(now).toISOString(),
        status: moderation ? "pending" : "approved", ...(moderation ? { delivery: { attempts: 0, nextAttemptAt: now } } : {}) };
      if (!validPost(full) || Boolean(post.image) !== Boolean(image) || (image && (image.length > KLADKA_LIMITS.imageMaxBytes || sniffImage(image)?.ext !== post.image?.ext))) throw new TypeError("Invalid post image");
      let savedImage: string | null = null;
      try {
        return await enqueue(async data => {
          const today = full.createdAt.slice(0, 10);
          if (data.posts.filter(item => item.ipHash === post.ipHash && item.createdAt.slice(0, 10) === today).length >= KLADKA_LIMITS.postsPerDay) throw new KladkaQuotaError("Daily post limit");
          if (image && post.image) {
            await fs.mkdir(imagesDir, { recursive: true, mode: 0o700 });
            savedImage = path.join(imagesDir, `${full.id}.${post.image.ext}`);
            const file = await fs.open(savedImage, "wx", 0o600);
            try { await file.writeFile(image); await file.sync(); } finally { await file.close(); }
          }
          // Only publish image metadata after its complete file exists. An interrupted
          // process can leave an unreferenced file, never a post pointing to half an image.
          data.posts.push(full);
          return full;
        });
      } catch (error) {
        if (savedImage) await fs.rm(savedImage, { force: true }).catch(() => {});
        throw error;
      }
    },
    async setPostStatus(id: string, status: KladkaStatus): Promise<KladkaPost | null> {
      return enqueue(data => {
        const post = data.posts.find(item => item.id === id);
        if (!post) return null;
        if (post.status === "pending") { post.status = status; post.moderatedAt = new Date().toISOString(); }
        return post;
      });
    },
    async getApprovedPosts(limit = 100) {
      return (await readData()).posts.filter(post => post.status === "approved")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async getPost(id: string) { return (await readData()).posts.find(post => post.id === id) ?? null; },
    readImage,
    /** At least once: a lost Telegram acknowledgement may produce a duplicate message. */
    async deliverNext(send: (post: KladkaPost, image: Buffer | null) => Promise<void>, now = Date.now()) {
      if (!(await readData()).posts.some(item => item.status === "pending" && !item.delivery?.deliveredAt && (item.delivery?.nextAttemptAt ?? 0) <= now)) return { attempted: false, delivered: false };
      const post = await enqueue(data => {
        const pending = data.posts.find(item => item.status === "pending" && !item.delivery?.deliveredAt && (item.delivery?.nextAttemptAt ?? 0) <= now);
        if (!pending) return null;
        const attempts = (pending.delivery?.attempts ?? 0) + 1;
        pending.delivery = { attempts, nextAttemptAt: now + Math.min(3600000, 60000 * 2 ** Math.min(attempts - 1, 6)) };
        return structuredClone(pending);
      });
      if (!post) return { attempted: false, delivered: false };
      try {
        await send(post, post.image ? await readImage(post.id, post.image.ext) : null);
        await enqueue(data => {
          const current = data.posts.find(item => item.id === post.id);
          if (current?.delivery) current.delivery.deliveredAt = new Date(now).toISOString();
        });
        return { attempted: true, delivered: true };
      } catch {
        // The persisted retry deadline also survives a process crash during delivery.
        return { attempted: true, delivered: false };
      }
    },
  };
}

let store: ReturnType<typeof createKladkaStore> | undefined;
export const kladkaStore = () => store ??= createKladkaStore(process.env.KLADKA_DATA_DIR ?? ".kladka");
export const getApprovedPosts = (limit = 100) => kladkaStore().getApprovedPosts(limit);
export const getPost = (id: string) => kladkaStore().getPost(id);
export const readImage = (id: string, ext: string) => kladkaStore().readImage(id, ext);
export const setPostStatus = (id: string, status: KladkaStatus) => kladkaStore().setPostStatus(id, status);
