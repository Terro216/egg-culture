import fs from "node:fs/promises";
import path from "node:path";

// Кэш живет в отдельной директории, чтобы в Docker её можно было
// примонтировать volume'ом и не терять накопленное при redeploy.
const CACHE_DIR = path.resolve(process.cwd(), ".news-cache");
const CACHE_FILE = path.join(CACHE_DIR, "news.json");
// Старое расположение — читаем как fallback при первом запуске после миграции.
const LEGACY_CACHE_FILE = path.resolve(process.cwd(), ".news_cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHED_ITEMS = 1000;
const FETCH_TIMEOUT = 10 * 1000; // 10 seconds

interface NewsItem {
  article_id?: string;
  link: string;
  title: string;
  description?: string;
  image_url?: string;
  pubDate: string;
  [key: string]: any;
}

interface CacheData {
  lastFetch: {
    ru?: number;
    en?: number;
  };
  news: {
    ru?: NewsItem[];
    en?: NewsItem[];
  };
}

async function readCacheFile(file: string): Promise<CacheData | null> {
  try {
    const data = await fs.readFile(file, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function readCache(): Promise<CacheData> {
  return (
    (await readCacheFile(CACHE_FILE)) ??
    (await readCacheFile(LEGACY_CACHE_FILE)) ?? { lastFetch: {}, news: {} }
  );
}

// Пишем во временный файл и переименовываем: rename атомарен в пределах
// файловой системы, поэтому упавший посреди записи процесс не оставит
// обрезанный JSON.
async function writeCache(data: CacheData): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmpFile = `${CACHE_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpFile, CACHE_FILE);
  } catch (error) {
    console.error("Failed to write news cache to disk:", error);
  }
}

// Все изменения кэша идут через одну очередь: каждое обновление заново читает
// актуальное состояние с диска, применяет свою правку и записывает результат.
// Иначе конкурентные обновления ru и en затирали бы друг друга (last writer wins).
let updateQueue: Promise<unknown> = Promise.resolve();

function enqueueCacheUpdate(
  mutate: (cache: CacheData) => CacheData,
): Promise<void> {
  const task = updateQueue
    .catch(() => {})
    .then(async () => {
      const cache = await readCache();
      await writeCache(mutate(cache));
    });
  updateQueue = task;
  return task;
}

function parsePubDate(pubDate: string): number {
  // NewsData.io отдает "YYYY-MM-DD HH:MM:SS" в UTC — нормализуем к ISO.
  const iso =
    typeof pubDate === "string" && !pubDate.includes("T")
      ? pubDate.replace(" ", "T") + "Z"
      : pubDate;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

async function fetchAndCacheNews(
  lang: "ru" | "en",
  existingNews: NewsItem[],
): Promise<NewsItem[] | null> {
  // We use import.meta.env since we're in an Astro/Vite environment
  const apiKey = import.meta.env.NEWS_API_KEY || "demo";
  const query = lang === "ru" ? "яйцо OR яйца" : "egg OR eggs";
  // Adding size=10 to the request as requested (page_size 5 or 10)
  const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=${lang}&size=10`;

  try {
    // Без таймаута висящий запрос к newsdata.io блокирует рендер до дефолтного
    // таймаута undici — лучше быстро упасть и отдать закэшированные новости.
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) {
      console.warn("News API responded with status:", res.status);
      return null;
    }

    const data = await res.json();
    const fetchedNews: NewsItem[] = Array.isArray(data.results)
      ? data.results
      : [];

    // Merge with existing news and deduplicate
    const combined = [...fetchedNews, ...existingNews];
    const uniqueNewsMap = new Map<string, NewsItem>();

    for (const item of combined) {
      const key = item.article_id || item.link;
      if (key && !uniqueNewsMap.has(key)) {
        uniqueNewsMap.set(key, item);
      }
    }

    // Sort by publication date descending
    const updatedNews = Array.from(uniqueNewsMap.values())
      .sort((a, b) => parsePubDate(b.pubDate) - parsePubDate(a.pubDate))
      .slice(0, MAX_CACHED_ITEMS);

    const now = Date.now();
    await enqueueCacheUpdate((cache) => {
      cache.lastFetch[lang] = now;
      cache.news[lang] = updatedNews;
      return cache;
    });

    return updatedNews;
  } catch (e) {
    // Отдаём кэш и логируем одной строкой, без полного дампа ошибки undici
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`Failed to fetch world news (${lang}), using cache: ${reason}`);
    return null;
  }
}

// Дедупликация конкурентных запросов: когда TTL истёк и на страницу блога
// заходят несколько посетителей сразу, к NewsData.io должен уйти один запрос,
// а не по одному на посетителя (бесплатный тариф — ~200 запросов в день).
const inFlight = new Map<"ru" | "en", Promise<NewsItem[] | null>>();

export async function getCachedWorldNews(
  lang: "ru" | "en",
): Promise<NewsItem[]> {
  const cache = await readCache();
  const now = Date.now();
  const lastFetch = cache.lastFetch[lang] || 0;

  const needsFetch =
    now - lastFetch > CACHE_TTL ||
    !(cache.news[lang] && cache.news[lang]!.length > 0);

  if (needsFetch) {
    let pending = inFlight.get(lang);
    if (!pending) {
      pending = fetchAndCacheNews(lang, cache.news[lang] ?? []).finally(() =>
        inFlight.delete(lang),
      );
      inFlight.set(lang, pending);
    }
    const fetched = await pending;
    if (fetched) return fetched;
  }

  return cache.news[lang] || [];
}
