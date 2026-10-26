import { useEffect, useState } from "react";
import { incubatorDay, incubatorMode } from "../Incubator/rules.ts";
import type { IncubatorState } from "../Incubator/rules.ts";

export default function ProfileIncubator({ state, lang }: { state: IncubatorState | null; lang: "ru" | "en" }) {
  const ru = lang === "ru";
  const [today, setToday] = useState(incubatorDay);
  useEffect(() => {
    const update = () => { if (!document.hidden) setToday(incubatorDay()); };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("pageshow", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const { mode } = incubatorMode(state, today);
  const active = mode === "ready" || mode === "warmedToday";
  const statuses = ru ? {
    lay: "Вы ещё не заложили яйцо в этом профиле.",
    void: "Пустота поглотила кладку. Можно заложить новое яйцо.",
    burned: "Холодильный Ожог. Серия тепла прервана — яйцо пора отогреть.",
    ready: "Яйцо ждёт сегодняшнего тепла.",
    warmedToday: "Сегодня яйцо уже прогрето.",
  } : {
    lay: "You haven't set an egg in this profile yet.",
    void: "The Void has taken the clutch. You can set a new egg.",
    burned: "Freezer Burn. The warmth streak has ended — your egg needs rewarming.",
    ready: "Your egg is waiting for today's warmth.",
    warmedToday: "Your egg has already been warmed today.",
  };
  return <section className="portal-settings portal-incubator" data-incubator-mode={mode}>
    <h2>{ru ? "Мой Инкубатор" : "My Incubator"}</h2>
    <p>{statuses[mode]}</p>
    {state && active && <p className="portal-incubator-stats">{ru ? `Яй Ци: ${state.qi} · Серия тепла: ${state.streak}` : `Egg Qi: ${state.qi} · Warmth streak: ${state.streak}`}</p>}
    {state && (active || mode === "burned") && <p className="portal-note">{ru ? "Последний прогрев: " : "Last warmed: "}{new Date(`${state.lastWarm}T12:00:00Z`).toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}</p>}
    <a className="btn btn-link" href={`/${lang}/incubator/`}>{mode === "lay" ? ru ? "Заложить яйцо →" : "Set an egg →" : mode === "void" ? ru ? "Начать новую кладку →" : "Start a new clutch →" : mode === "burned" ? ru ? "Отогреть яйцо →" : "Rewarm your egg →" : ru ? "Открыть Инкубатор →" : "Open Incubator →"}</a>
  </section>;
}
