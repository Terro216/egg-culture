import { ACHIEVEMENTS, AVATARS, GAME_NAMES, isAchievement } from "./model.ts";
import type { PortalGame, PublicProfile } from "./model.ts";
import { compactCount } from "../EggFry/rules.ts";
import "./Profile.css";
import { achievementFrequency } from "./achievementFrequency.ts";

export default function ProfileCard({ profile, lang }: { profile: PublicProfile; lang: "ru" | "en" }) {
  const ru = lang === "ru";
  return <section className="portal-card">
    <header className="portal-identity"><span aria-hidden="true">{AVATARS[profile.avatar] ?? AVATARS[0]}</span><div><p>{ru ? "Личное дело адепта" : "Adept's record"}</p><h2>{profile.name}</h2></div></header>
    <div className="portal-game-stats">{(["road", "fry", "chalaza", "oracle", "untangle"] as PortalGame[]).map(game => {
      const stat = profile.stats.find(s => s.game === game);
      if (game === "untangle") return <article key={game}><h3>{GAME_NAMES[lang][game]}</h3><strong>{stat?.solved ?? "—"}</strong><small>{ru ? "кладок распутано" : "clutches untangled"}</small>{stat && <>
        <small>{ru ? "Путь адепта" : "Adept’s path"}: {stat.completedLevels ?? 0} / 24 · {ru ? "Высший уровень" : "Highest level"}: {stat.best}</small>
        <small>{ru ? "Перестановки" : "Swap-only"}: {stat.hardCompletedLevels ?? 0} / 24 · {ru ? "Кладок распутано" : "Clutches untangled"}: {stat.hardSolved ?? 0}</small>
        {(stat.legacyCompletedLevels ?? 0) > 0 && <small>{ru ? "Первый свиток" : "First scroll"}: {stat.legacyCompletedLevels} / 24</small>}
        <small>{ru ? "Кладок дня" : "Daily clutches"}: {stat.dailySolved ?? 0} · {ru ? "Серия дней" : "Day streak"}: {stat.dailyStreak ?? 0}</small>
      </>}</article>;
      return <article key={game}><h3>{GAME_NAMES[lang][game]}{stat?.roadRules === 2 ? " · II" : ""}</h3><strong>{stat ? compactCount(BigInt(stat.best), lang) : "—"}</strong><small>{game === "fry" ? ru ? "яиц приготовлено" : "eggs cooked" : ru ? "очков" : "points"}</small>{game === "road" && profile.classicRoadBest && <small>{ru ? "Классическая дорога" : "Classic road"}: {compactCount(BigInt(profile.classicRoadBest), lang)}</small>}</article>;
    })}</div>
    <h3 className="portal-achievement-heading">{ru ? "Ачивки" : "Achievements"} <span>{profile.achievements.filter(isAchievement).length} / {Object.keys(ACHIEVEMENTS).length}</span></h3>
    <div className="portal-badges">{Object.entries(ACHIEVEMENTS).map(([id, item]) => {
      const earned = profile.achievements.includes(id);
      const frequency = achievementFrequency(profile, id, lang);
      return <article key={id} className={earned ? "is-earned" : "is-locked"}><span aria-hidden="true">{earned ? item[4] : "·"}</span><div><strong>{item[ru ? 0 : 1]}</strong><p>{item[ru ? 2 : 3]}</p><small>{earned ? ru ? "Получено" : "Unlocked" : ru ? "Не получено" : "Locked"}{frequency && ` · ${frequency}`}</small></div></article>;
    })}</div>
  </section>;
}
