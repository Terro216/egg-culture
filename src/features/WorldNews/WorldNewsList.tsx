import { useState } from "react";

interface NewsItem {
  article_id?: string;
  link: string;
  title: string;
  description?: string;
  image_url?: string;
  pubDate: string;
}

interface WorldNewsListProps {
  news: NewsItem[];
  lang: "ru" | "en";
}

const ITEMS_PER_PAGE = 10;

// NewsData.io отдает pubDate вида "2026-07-28 07:00:00" (UTC, не ISO):
// Safari парсит такую строку в Invalid Date, остальные браузеры — как локальное время.
function formatPubDate(pubDate: string, lang: "ru" | "en"): string {
  const iso = pubDate.includes("T") ? pubDate : pubDate.replace(" ", "T") + "Z";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US");
}

export default function WorldNewsList({ news, lang }: WorldNewsListProps) {
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
  };

  const visibleNews = news.slice(0, visibleCount);
  const hasMore = visibleCount < news.length;

  if (news.length === 0) {
    return (
      <p style={{ textAlign: "center", opacity: 0.6 }}>
        {lang === "ru"
          ? "Новости не найдены или API ключ не настроен. Добавьте NEWS_API_KEY в .env для интеграции с NewsData.io."
          : "No news found or API key not set. Add NEWS_API_KEY to .env for NewsData.io integration."}
      </p>
    );
  }

  return (
    <div className="blog-list flex-col gap-xl">
      {visibleNews.map((item, index) => (
        <a
          key={item.article_id || index}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="blog-post-row"
        >
          {item.image_url && (
            <div className="post-image-wrapper">
              <img
                src={item.image_url}
                alt={item.title}
                loading="lazy"
                onError={(e) => {
                  const wrapper = (e.target as HTMLImageElement).closest(
                    ".post-image-wrapper",
                  ) as HTMLElement | null;
                  if (wrapper) wrapper.style.display = "none";
                }}
              />
            </div>
          )}
          <div className="post-content-wrapper flex-col">
            <span className="post-date">{formatPubDate(item.pubDate, lang)}</span>
            <h2 className="post-title">{item.title}</h2>
            <p className="post-excerpt">{item.description}</p>
            <span className="read-more">
              {lang === "ru" ? "Читать в источнике →" : "Read on source →"}
            </span>
          </div>
        </a>
      ))}

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <button className="load-more-btn" onClick={handleLoadMore}>
            {lang === "ru" ? "Загрузить еще" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
