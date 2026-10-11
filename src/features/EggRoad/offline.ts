import { useEffect, useState } from "react";
export function useRoadOffline(lang: "ru" | "en") {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator) || location.pathname !== `/${lang}/play/`) return;
    let live = true;
    void navigator.serviceWorker.register("/egg-road-sw.js", { scope: `/${lang}/play/`, updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready).then(() => { if (live) setReady(true); })
      .catch(() => { /* Offline storage is optional and does not block a descent. */ });
    return () => { live = false; };
  }, [lang]);
  return ready;
}
