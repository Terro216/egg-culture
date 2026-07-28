import fs from "node:fs/promises";
import path from "node:path";

const CACHE_FILE = path.resolve(process.cwd(), ".news_cache.json");
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

async function readCache(): Promise<CacheData> {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty cache
    return { lastFetch: {}, news: {} };
  }
}

async function writeCache(data: CacheData): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to write news cache to disk:", error);
  }
}

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
    // We use import.meta.env since we're in an Astro/Vite environment
    const apiKey = import.meta.env.NEWS_API_KEY || "demo";
    const query = lang === "ru" ? "яйцо OR яйца" : "egg OR eggs";
    // Adding size=10 to the request as requested (page_size 5 or 10)
    const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=${lang}&size=10`;

    try {
      // Без таймаута висящий запрос к newsdata.io блокирует рендер до дефолтного
      // таймаута undici — лучше быстро упасть и отдать закэшированные новости.
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (res.ok) {
        const data = await res.json();
        const fetchedNews: NewsItem[] = Array.isArray(data.results)
          ? data.results
          : [];

        // Merge with existing news and deduplicate
        const existingNews = Array.isArray(cache.news[lang])
          ? cache.news[lang]!
          : [];
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
          .sort((a, b) => {
            return (
              new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
            );
          })
          .slice(0, MAX_CACHED_ITEMS);

        cache.lastFetch[lang] = now;
        cache.news[lang] = updatedNews;
        await writeCache(cache);

        return updatedNews;
      } else {
        console.warn("News API responded with status:", res.status);
      }
    } catch (e) {
      // Отдаём кэш и логируем одной строкой, без полного дампа ошибки undici
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to fetch world news (${lang}), using cache: ${reason}`);
    }
  }

  return cache.news[lang] || [];
}
