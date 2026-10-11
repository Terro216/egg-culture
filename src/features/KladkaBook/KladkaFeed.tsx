import { useEffect, useState } from "react";
import { useAdept } from "../Portal/useAdept.ts";
import { usePortal } from "../Portal/PortalPresence.tsx";
import { portalIdentityReady } from "../Portal/client.ts";
import type { KladkaEntry } from "../../shared/utils/kladkaStore.ts";
import "./KladkaFeed.css";

function linkedText(text: string) {
  return text.split(/(https?:\/\/[^\s<]+)/g).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="nofollow noopener noreferrer">{part}</a>
    : part);
}

export default function KladkaFeed({ lang, initialPosts }: { lang: "ru" | "en"; initialPosts: KladkaEntry[] }) {
  const ru = lang === "ru", portal = usePortal(), adept = useAdept();
  const [posts, setPosts] = useState(initialPosts);
  const [hydrated, setHydrated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const ready = portalIdentityReady(portal), registered = portal.account?.registered, name = portal.account?.name;

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    if (!ready || portal.failed) return;
    // Existing guests may have only the persistent local flag after a browser
    // restart. Mirror it to the existing guest cookie before the server read.
    if (!registered && adept) {
      try { document.cookie = "egg_guest_initiated=1; Path=/; SameSite=Lax"; } catch { /* The server remains authoritative. */ }
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let active = true;
    setFailed(false);
    void fetch("/api/kladka-feed", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json() as { posts: KladkaEntry[] };
        if (active) setPosts(data.posts);
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [ready, portal.failed, registered, name, adept, retry]);

  return <section className="kladka-feed flex-col gap-lg" aria-label={ru ? "Записи Книги" : "Book entries"}>
    {failed && <p className="kladka-feed-error" role="status">
      {ru ? "Не удалось обновить записи. " : "Could not refresh the entries. "}
      <button type="button" className="btn" onClick={() => setRetry(value => value + 1)}>{ru ? "Повторить" : "Retry"}</button>
    </p>}
    {posts.length === 0 && <p className="kladka-empty text-center">
      {ru ? "Книга еще чиста. Первая запись — самая тихая." : "The Book is still blank. The first entry is the quietest."}
    </p>}
    {posts.map(post => {
      const locked = post.locked || (hydrated && !adept && post.visibility === "adepts");
      return <article key={post.id} id={`entry-${post.id}`} className={`kladka-post${locked ? " kladka-post-locked" : ""}`}>
        <header className="kladka-post-head">
          <span className="kladka-post-name">{post.name}</span>
          <span className="kladka-post-meta">
            {post.visibility === "adepts" && <span className="kladka-post-visibility">{ru ? "Только адептам" : "Adepts only"}</span>}
            {!locked && !post.locked && post.style && <span>{post.style}</span>}
            <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString(ru ? "ru-RU" : "en-GB", {
              day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow",
            })}</time>
          </span>
        </header>
        {locked ? <div className="kladka-entry-gate">
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden="true">
            <rect x="3" y="12" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 12V7a5 5 0 0 1 10 0v5M12 18v3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p>{ru ? "Эта запись видна только адептам." : "This entry is visible to Adepts only."}</p>
          <a className="btn" href={`/${lang}/quiz/`} onClick={() => {
            try { localStorage.setItem("egg_after_quiz", `/${lang}/kladka/#entry-${post.id}`); } catch { /* The quiz still opens. */ }
          }}>{ru ? "Пройти Инициацию" : "Pass the Initiation"}</a>
        </div> : !post.locked && <>
          {post.image && <img className="kladka-post-image" src={`/api/kladka-image?id=${encodeURIComponent(post.id)}&v=2`} alt="" loading="lazy" />}
          {post.text && <p className="kladka-post-text">{linkedText(post.text)}</p>}
        </>}
      </article>;
    })}
  </section>;
}
