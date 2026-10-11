import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ACHIEVEMENTS, isAchievement } from "./model.ts";
import type { AchievementId } from "./model.ts";
import "./AchievementToasts.css";

export default function AchievementToasts({ lang }: { lang: "ru" | "en" }) {
  const [queue, setQueue] = useState<AchievementId[]>([]);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const ids = (event as CustomEvent<unknown>).detail;
      if (Array.isArray(ids)) setQueue(current => [...new Set([...current, ...ids.filter(isAchievement)])].slice(0, 12));
    };
    const fullscreen = () => setHost(document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? document.body);
    const accountChanged = () => setQueue([]);
    fullscreen();
    window.addEventListener("egg:achievements", receive);
    window.addEventListener("egg:account", accountChanged);
    document.addEventListener("fullscreenchange", fullscreen); document.addEventListener("webkitfullscreenchange", fullscreen);
    return () => { window.removeEventListener("egg:achievements", receive); window.removeEventListener("egg:account", accountChanged); document.removeEventListener("fullscreenchange", fullscreen); document.removeEventListener("webkitfullscreenchange", fullscreen); };
  }, []);
  const active = queue[0];
  useEffect(() => { if (active) { const timer = setTimeout(() => setQueue(q => q.slice(1)), 4600); return () => clearTimeout(timer); } }, [active]);
  if (!active || typeof document === "undefined") return null;
  const item = ACHIEVEMENTS[active];
  return createPortal(<aside key={active} className="portal-achievement-toast" role="status" aria-live="polite">
    <span className="portal-achievement-seal" aria-hidden="true">{item[4]}</span>
    <div><small>{lang === "ru" ? "Достижение получено" : "Achievement unlocked"}</small><strong>{item[lang === "ru" ? 0 : 1]}</strong><p>{item[lang === "ru" ? 2 : 3]}</p></div>
  </aside>, host ?? document.body);
}
