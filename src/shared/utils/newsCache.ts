import fs from "node:fs/promises";
import path from "node:path";

const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHED_ITEMS = 1000;
const FETCH_TIMEOUT = 10000;
type Lang = "ru" | "en";
interface NewsItem {
  article_id?: string; link: string; title: string; description?: string; image_url?: string; pubDate: string;
  [key: string]: unknown;
}
interface CacheData {
  lastFetch: Partial<Record<Lang, number>>;
  news: Partial<Record<Lang, NewsItem[]>>;
  retry?: Partial<Record<Lang, { attempts: number; nextAt: number }>>;
}
const isNews = (item: unknown): item is NewsItem => Boolean(item && typeof item === "object"
  && typeof (item as NewsItem).link === "string" && /^https?:\/\//i.test((item as NewsItem).link)
  && typeof (item as NewsItem).title === "string" && typeof (item as NewsItem).pubDate === "string");
function parsePubDate(pubDate: string) {
  const time = Date.parse(pubDate.includes("T") ? pubDate : pubDate.replace(" ", "T") + "Z");
  return Number.isFinite(time) ? time : 0;
}

/** Persistent cooldowns avoid exhausting the provider quota across requests/restarts. */
export function createNewsCache(directory: string, options: { fetchImpl?: typeof fetch; now?: () => number; legacyFile?: string } = {}) {
  const cacheFile = path.join(directory, "news.json"), now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let updates: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<Lang, Promise<NewsItem[] | null>>();
  const retryMemory = new Map<Lang, number>();
  async function readFile(file: string): Promise<CacheData | null> {
    try {
      const data = JSON.parse(await fs.readFile(file, "utf8"));
      if (!data || typeof data.lastFetch !== "object" || !data.lastFetch || typeof data.news !== "object" || !data.news) return null;
      const cache: CacheData = { lastFetch: {}, news: {}, retry: {} };
      for (const lang of ["ru", "en"] as const) {
        if (Number.isFinite(data.lastFetch[lang]) && data.lastFetch[lang] > 0) cache.lastFetch[lang] = data.lastFetch[lang];
        if (Array.isArray(data.news[lang])) cache.news[lang] = data.news[lang].filter(isNews).slice(0, MAX_CACHED_ITEMS);
        const retry = data.retry?.[lang];
        if (Number.isSafeInteger(retry?.attempts) && retry.attempts >= 0 && Number.isFinite(retry.nextAt)) cache.retry![lang] = retry;
      }
      return cache;
    } catch { return null; }
  }
  const read = async () => await readFile(cacheFile) ?? (options.legacyFile ? await readFile(options.legacyFile) : null) ?? { lastFetch: {}, news: {}, retry: {} } as CacheData;
  function update(mutate: (cache: CacheData) => void) {
    const task = updates.catch(() => {}).then(async () => {
      const cache = await read(); mutate(cache);
      await fs.mkdir(directory, { recursive: true });
      const temporary = `${cacheFile}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(cache)); await fs.rename(temporary, cacheFile);
    });
    updates = task;
    return task;
  }
  async function load(lang: Lang, cache: CacheData): Promise<NewsItem[] | null> {
    // Reserve a retry deadline before fetching, including when a process stops mid-request.
    const attempts = Math.min(10, (cache.retry?.[lang]?.attempts ?? 0) + 1);
    const nextAt = now() + Math.min(3600000, 60000 * 2 ** (attempts - 1));
    retryMemory.set(lang, nextAt);
    try { await update(value => { (value.retry ??= {})[lang] = { attempts, nextAt }; }); }
    catch { console.warn(`News cache (${lang}) could not persist retry state`); }
    try {
      const apiKey = process.env.NEWS_API_KEY || import.meta.env?.NEWS_API_KEY || "demo";
      const query = lang === "ru" ? "яйцо OR яйца" : "egg OR eggs";
      const response = await fetchImpl(`https://newsdata.io/api/1/news?apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&language=${lang}&size=10`, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!response.ok) throw new Error("News provider unavailable");
      const data = await response.json();
      if (!Array.isArray(data?.results)) throw new Error("Invalid news response");
      const unique = new Map<string, NewsItem>();
      for (const item of [...data.results.filter(isNews), ...(cache.news[lang] ?? [])]) {
        const key = item.article_id || item.link;
        if (!unique.has(key)) unique.set(key, item);
      }
      const news = [...unique.values()].sort((a, b) => parsePubDate(b.pubDate) - parsePubDate(a.pubDate)).slice(0, MAX_CACHED_ITEMS);
      await update(value => { value.lastFetch[lang] = now(); value.news[lang] = news; delete value.retry?.[lang]; });
      retryMemory.delete(lang);
      return news;
    } catch {
      // URLs and transport messages may contain the provider API key.
      console.warn(`World news (${lang}) unavailable; retaining cached entries`);
      return null;
    }
  }
  async function get(lang: Lang): Promise<NewsItem[]> {
    const cache = await read(), lastFetch = cache.lastFetch[lang] ?? 0;
    const nextAt = Math.max(cache.retry?.[lang]?.nextAt ?? 0, retryMemory.get(lang) ?? 0);
    if (lastFetch && now() - lastFetch <= CACHE_TTL) return cache.news[lang] ?? [];
    let pending = inFlight.get(lang);
    if (!pending && now() >= nextAt) {
      pending = load(lang, cache).finally(() => inFlight.delete(lang));
      inFlight.set(lang, pending);
    }
    // Existing content (including a successfully fetched empty feed) renders immediately.
    if (Array.isArray(cache.news[lang])) return cache.news[lang]!;
    return (pending ? await pending : null) ?? [];
  }
  return { get, async settled() { await Promise.all([...inFlight.values()]); } };
}

const news = createNewsCache(path.resolve(process.cwd(), ".news-cache"), { legacyFile: path.resolve(process.cwd(), ".news_cache.json") });
export const getCachedWorldNews = (lang: Lang) => news.get(lang);
