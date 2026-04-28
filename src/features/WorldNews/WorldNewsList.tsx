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
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
          <div className="post-content-wrapper flex-col">
            <span className="post-date">
              {new Date(item.pubDate).toLocaleDateString(
                lang === "ru" ? "ru-RU" : "en-US",
              )}
            </span>
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
