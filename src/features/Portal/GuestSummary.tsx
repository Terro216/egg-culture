import { useEffect, useState } from "react";
import { GUEST_INCUBATOR_EVENT, readGuestIncubator } from "../Incubator/guest.ts";
import type { GuestIncubator } from "../Incubator/guest.ts";
import { daysBetween, incubatorDay, incubatorMode } from "../Incubator/rules.ts";
import { guestInitiated } from "./adept.ts";
import { portalIdentityReady, portalState } from "./client.ts";

type Snapshot = { initiated: boolean | null; incubator: GuestIncubator; today: string };

export default function GuestSummary({ lang, onCertificate }: { lang: "ru" | "en"; onCertificate: () => void }) {
  const ru = lang === "ru";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    const update = () => {
      const portal = portalState();
      if (!portalIdentityReady(portal) || portal.failed || portal.account?.registered) {
        setSnapshot(null);
        return;
      }
      const today = incubatorDay();
      let initiated: boolean | null = guestInitiated();
      // A missing result and an unreadable result are different, even if cookies work.
      if (!initiated) {
        try { localStorage.getItem("egg_adept"); }
        catch { initiated = null; }
      }
      setSnapshot({ initiated, incubator: readGuestIncubator(today), today });
    };
    const visible = () => { if (!document.hidden) update(); };
    const events = ["egg:initiation", GUEST_INCUBATOR_EVENT, "egg:account", "egg:portal", "storage", "focus", "pageshow"];
    events.forEach(event => window.addEventListener(event, update));
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60000);
    update();
    return () => {
      events.forEach(event => window.removeEventListener(event, update));
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, []);
  if (!snapshot) return null;

  const { initiated, incubator, today } = snapshot;
  const { mode } = incubatorMode(incubator.state, today);
  const readable = incubator.state !== null || incubator.storage === "empty";
  const statuses = ru ? {
    lay: "Яйцо ещё не заложено.", ready: "Яйцо ждёт сегодняшнего тепла.", warmedToday: "Сегодня яйцо уже прогрето.",
    burned: "Холодильный Ожог — яйцо пора отогреть.", void: "Пустота поглотила кладку. Можно начать заново.",
  } : {
    lay: "No egg has been set yet.", ready: "Your egg is waiting for today's warmth.", warmedToday: "Your egg has already been warmed today.",
    burned: "Freezer Burn — your egg needs rewarming.", void: "The Void has taken the clutch. You can begin again.",
  };
  return <section className="portal-settings portal-guest-summary" aria-labelledby="portal-guest-heading">
    <h2 id="portal-guest-heading">{ru ? "Ваш гостевой путь" : "Your guest progress"}</h2>
    <p className="portal-note">{ru ? "Ваши ритуалы в этом браузере." : "Your rituals in this browser."}</p>
    <div className="portal-guest-grid">
      <article>
        <h3>{ru ? "Инициация" : "Initiation"}</h3>
        <p>{initiated === true ? (ru ? "Пройдена. Вы — адепт." : "Passed. You are an adept.") : initiated === false ? (ru ? "Пока не пройдена." : "Not passed yet.") : (ru ? "Не удалось прочитать результат в этом браузере." : "Could not read your result in this browser.")}</p>
        {initiated ? <button type="button" onClick={onCertificate}>{ru ? "Открыть сертификат →" : "View certificate →"}</button> : <a href={`/${lang}/quiz/`}>{ru ? "Открыть Инициацию →" : "Open Initiation →"}</a>}
      </article>
      <article>
        <h3>{ru ? "Инкубатор" : "Incubator"}</h3>
        {readable && <>
          <p>{statuses[mode]}</p>
          {incubator.state && mode !== "void" && <p className="portal-guest-stats">{ru ? `День выдержки ${daysBetween(incubator.state.startedAt, today) + 1} · Яй Ци: ${incubator.state.qi}` : `Day of aging ${daysBetween(incubator.state.startedAt, today) + 1} · Egg Qi: ${incubator.state.qi}`}</p>}
        </>}
        {incubator.storage === "invalid" && <p className="portal-note">{ru ? (incubator.state ? "Сохранённые данные не удалось прочитать. Показан прогресс этого посещения." : "Сохранённые данные не удалось прочитать. Они оставлены без изменений.") : (incubator.state ? "The saved data could not be read. Showing this visit's progress." : "The saved data could not be read. It has been left unchanged.")}</p>}
        {incubator.storage === "unavailable" && <p className="portal-note">{ru ? "Браузер не даёт прочитать сохранённый прогресс." : "The browser is preventing access to saved progress."}</p>}
        {incubator.storage === "session" && <p className="portal-note">{ru ? "Этот прогресс доступен только в текущем посещении." : "This progress is available only during this visit."}</p>}
        <a href={`/${lang}/incubator/`}>{readable && mode === "lay" ? (ru ? "Заложить яйцо →" : "Set an egg →") : readable && mode === "void" ? (ru ? "Начать новую кладку →" : "Start a new clutch →") : (ru ? "Открыть Инкубатор →" : "Open Incubator →")}</a>
      </article>
    </div>
  </section>;
}
