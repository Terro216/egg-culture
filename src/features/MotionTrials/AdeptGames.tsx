import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  MotionTrialKind,
  MotionTrialLang,
  MotionTrialResult,
} from "./MotionTrial";
import { readPointsBest } from "../EggRoad/storage";
import { readFryProgress } from "../EggFry/storage";
import { compactCount } from "../EggFry/rules";
import PortalPresence from "../Portal/PortalPresence.tsx";
import { useAdept } from "../Portal/useAdept.ts";
import { isInitiated } from "../Portal/adept.ts";
import GamesAccount from "../GamesHub/GamesAccount.tsx";
import { beginPortalRun, submitPortalResult } from "../Portal/client.ts";
import { activePortalName, portalStorageKey } from "../Portal/local.ts";
import { parseMotionScores } from "./scores.ts";
import type { MotionScores } from "./scores.ts";
import "./AdeptGames.css";

type Scores = MotionScores;
type GameKind = MotionTrialKind | "road" | "fry";
const MotionTrial = lazy(() => import("./MotionTrial").then((module) => ({ default: module.MotionTrial })));
const EggRoad = lazy(() => import("../EggRoad/EggRoad"));
const EggFry = lazy(() => import("../EggFry/EggFry"));

class GameBoundary extends React.Component<{ children: React.ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">{this.props.message}</p> : this.props.children; }
}

const ui = {
  ru: {
    kicker: "Практика адепта",
    title: "Испытания формы",
    intro:
      "Равновесие, восприятие, движение и преумножение кладки. Выберите испытание: каждое можно проходить в любом порядке и повторять без ограничений.",
    chalazaTitle: "Халаза-тест",
    chalazaDescription:
      "Поймайте центр и удержите форму, пока Яй Ци испытывает ваше равновесие.",
    oracleTitle: "Оракул желтка",
    oracleDescription:
      "Задайте вопрос и встряхните яйцо. Из глубины желтка проступит ответ — если Оракул готов его открыть.",
    roadTitle: "Путь формы",
    roadDescription: "Катите яйцо по дороге над Пустотой. Ловите повороты и срезайте путь через нижние витки.",
    fryTitle: "Великая Жарка",
    fryDescription: "Умножайте кладку, обходите кухонные инструменты и довезите как можно больше яиц до огромной сковороды.",
    untangleTitle: "Халазы судьбы",
    untangleDescription: "Распутайте белковые нити между яйцами и верните кладке Яй Ци. Сюжетные уровни, общая кладка дня и свободная игра — в обычном режиме или хардмоде.",
    fryBest: "Лучшая жарка", eggs: "яиц",
    gates: "очков",
    loading: "Испытание готовится…",
    loadError: "Не удалось загрузить испытание. Вернитесь к выбору и попробуйте снова.",
    begin: "Начать",
    best: "Лучший результат",
    endlessBest: "Рекорд бесконечной дороги",
    back: "К выбору испытаний",
  },
  en: {
    kicker: "The Adept's practice",
    title: "Trials of Form",
    intro:
      "Balance, perception, motion, and the multiplication of a clutch. Choose a trial, complete them in any order, and return as often as you wish.",
    chalazaTitle: "The Chalaza Test",
    chalazaDescription:
      "Catch the centre and hold the form while Egg Qi puts your balance to the test.",
    oracleTitle: "Oracle of the Yolk",
    oracleDescription:
      "Ask a question and shake the egg. An answer will emerge from the depths of the yolk — if the Oracle is ready to reveal it.",
    roadTitle: "Path of Form",
    roadDescription: "Roll an egg along the road above the Void. Catch the bends and take shortcuts through the lower turns.",
    fryTitle: "The Great Fry",
    fryDescription: "Multiply the clutch, dodge kitchen tools, and deliver as many eggs as possible to the enormous pan.",
    untangleTitle: "Chalazae of Fate",
    untangleDescription: "Untangle the albumen threads between eggs and restore the clutch’s Egg Qi. Story levels, a shared daily clutch and free play — in Classic or Hardmode.",
    fryBest: "Best delivery", eggs: "eggs",
    gates: "points",
    loading: "Preparing the trial…",
    loadError: "The trial could not load. Return to the selection and try again.",
    begin: "Begin",
    best: "Best result",
    endlessBest: "Endless road best",
    back: "Choose another trial",
  },
} as const;

const STORAGE_KEY = "egg_motion_trials_v1";

export const AdeptGames: React.FC<{ lang: MotionTrialLang; embedded?: boolean; publicHub?: boolean }> = ({ lang, embedded = false, publicHub = false }) => {
  const text = ui[lang], ru = lang === "ru", adept = useAdept();
  const [active, setActive] = useState<GameKind | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [roadBest, setRoadBest] = useState(0);
  const [fryBest, setFryBest] = useState("0");
  const motionRun = useRef(beginPortalRun("chalaza"));

  useEffect(() => {
    setRoadBest(readPointsBest("endless-v3"));
    setFryBest(readFryProgress().best);
    const query = new URL(window.location.href).searchParams;
    if (!publicHub && query.get("game") === "fry") setActive("fry");
    else if (!publicHub && query.has("road")) setActive("road");
    try {
      const stored = localStorage.getItem(portalStorageKey(STORAGE_KEY));
      if (stored) setScores(parseMotionScores(JSON.parse(stored)));
    } catch {
      // A blocked or malformed localStorage must not prevent play.
    }
  }, [publicHub]);

  useEffect(() => {
    if (!publicHub) return;
    const selected = new URL(window.location.href).searchParams.get("game");
    if (adept && (selected === "chalaza" || selected === "oracle")) {
      motionRun.current = beginPortalRun(selected);
      setActive(selected);
    } else setActive(null);
  }, [publicHub, adept]);

  useEffect(() => {
    if (publicHub && active) document.getElementById("trial")?.scrollIntoView({ block: "start" });
  }, [publicHub, active]);

  useEffect(() => {
    const reload = () => {
      setRoadBest(readPointsBest("endless-v3")); setFryBest(readFryProgress().best);
      try { setScores(parseMotionScores(JSON.parse(localStorage.getItem(portalStorageKey(STORAGE_KEY)) ?? "{}"))); } catch { setScores({}); }
    };
    window.addEventListener("egg:portal", reload); return () => window.removeEventListener("egg:portal", reload);
  }, []);

  const saveResult = ({ kind, score }: MotionTrialResult) => {
    if (publicHub && !isInitiated()) return false;
    if (!Number.isSafeInteger(score) || score < 0 || score > 100) return false;
    const ticket = motionRun.current, key = portalStorageKey(STORAGE_KEY, ticket.owner);
    let current: Scores = {};
    try { current = parseMotionScores(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch { /* Optional guest storage. */ }
    const next = { ...current, [kind]: Math.max(current[kind] ?? 0, score) };
    let stored = false;
    try { localStorage.setItem(key, JSON.stringify(next)); stored = true; } catch { /* A guest can retry saving without repeating the trial. */ }
    if (ticket.owner === activePortalName()) setScores(next);
    const accepted = submitPortalResult({ ...ticket, game: kind }, { score: String(score), peak: String(score), seconds: 0, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0 });
    if (!accepted || (!stored && !ticket.owner)) return false;
    motionRun.current = { ...ticket, id: globalThis.crypto.randomUUID() };
    return true;
  };

  const chooseGame = (kind: GameKind) => {
    if (publicHub && !isInitiated()) return;
    if (kind === "chalaza" || kind === "oracle") motionRun.current = beginPortalRun(kind);
    if (publicHub) {
      const url = new URL(window.location.href); url.searchParams.set("game", kind); url.hash = "trial";
      window.history.replaceState(null, "", url);
    }
    setActive(kind);
  };
  const closeGame = () => {
    setActive(null);
    if (publicHub) {
      const url = new URL(window.location.href); url.searchParams.delete("game"); url.hash = "";
      window.history.replaceState(null, "", url);
    }
  };
  const rememberQuiz = (kind?: MotionTrialKind) => {
    try { localStorage.setItem("egg_after_quiz", `/${lang}/games/${kind ? `?game=${kind}#trial` : ""}`); } catch { /* The quiz still opens. */ }
  };
  const Heading = publicHub ? "h1" : "h2";
  const order = publicHub ? ["road", "fry", "untangle", "chalaza", "oracle"] as const : ["chalaza", "oracle", "road", "fry", "untangle"] as const;

  return (
    <div className={`adept-games${embedded ? " is-embedded" : ""}${publicHub ? " is-public" : ""}`}>
      <header className="adept-games-header">
        {!publicHub && <p>{text.kicker}</p>}
        <Heading>{publicHub ? (ru ? "Яичные игры" : "Egg Games") : text.title}</Heading>
        <span>{publicHub ? (ru ? "Катите, умножайте, распутывайте. Для каждой формы найдётся своё испытание." : "Roll, multiply, untangle. Every form has a trial of its own.") : text.intro}</span>
      </header>
      {publicHub ? <GamesAccount lang={lang} /> : <PortalPresence lang={lang} />}

      {active && (!publicHub || adept) ? (
        <div className="adept-game-active" id={publicHub ? "trial" : undefined}>
          <button
            className="adept-games-back"
            type="button"
            onClick={closeGame}
          >
            ← {text.back}
          </button>
          <GameBoundary key={active} message={text.loadError}>
            <Suspense fallback={<p role="status">{text.loading}</p>}>
              {active === "road" ? (
                <EggRoad lang={lang} onClose={() => { setRoadBest(readPointsBest("endless-v3")); setActive(null); }} onComplete={(result) => { if (result.mode === "endless" && result.code.startsWith("EGG3-")) setRoadBest((best) => Math.max(best, result.score)); }} />
              ) : active === "fry" ? (
                <EggFry lang={lang} onClose={() => { setFryBest(readFryProgress().best); setActive(null); const url = new URL(window.location.href); url.searchParams.delete("game"); url.searchParams.delete("fry"); window.history.replaceState(null, "", url); }} onComplete={() => setFryBest(readFryProgress().best)} />
              ) : (
                <MotionTrial key={active} kind={active} lang={lang} onComplete={saveResult} />
              )}
            </Suspense>
          </GameBoundary>
        </div>
      ) : (
        <div className="adept-games-grid">
          {order.map((kind, index) => {
            const restricted = kind === "chalaza" || kind === "oracle";
            const locked = publicHub && restricted && !adept;
            const href = kind === "road" ? `/${lang}/play/` : kind === "fry" ? `/${lang}/fry/` : `/${lang}/untangle/`;
            return <article className={`adept-game-card${locked ? " is-locked" : ""}`} key={kind} data-game={kind}>
              <div className="adept-game-card-head">
                <span className="adept-game-mark" aria-hidden="true">{["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"][index]}</span>
                {locked && <span className="adept-game-lock"><svg width="16" height="20" viewBox="0 0 24 28" fill="none" aria-hidden="true"><rect x="3" y="12" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 12V7a5 5 0 0 1 10 0v5M12 18v3" stroke="currentColor" strokeWidth="1.5" /></svg>{ru ? "Только адептам" : "Adepts only"}</span>}
              </div>
              <h3>
                {text[`${kind}Title`]}
              </h3>
              <p>{text[`${kind}Description`]}</p>
              {!locked && kind !== "untangle" && (kind === "fry" ? (BigInt(fryBest) > 0n && <small>{text.fryBest}: {compactCount(BigInt(fryBest), lang)} {text.eggs}</small>) : (kind === "road" ? roadBest : scores[kind]) ? (
                <small>
                  {kind === "road" ? text.endlessBest : text.best}: {kind === "road" ? `${roadBest} ${text.gates}` : `${scores[kind]} / 100`}
                </small>
              ) : null)}
              {locked ? <a className="adept-game-link" href={`/${lang}/quiz/`} onClick={() => rememberQuiz(kind as MotionTrialKind)}>{ru ? "Пройти Инициацию" : "Pass the Initiation"} →</a>
              : kind === "untangle" || (publicHub && !restricted) ? <a className="adept-game-link" href={href}>{text.begin} →</a>
              : <button type="button" onClick={() => chooseGame(kind)}>
                {text.begin}
              </button>}
            </article>;
          })}
        </div>
      )}
      {publicHub && <footer className="games-hub-footer">
        <p>{ru ? "Манифест — первый шаг к Инициации." : "The Manifesto is the first step towards the Initiation."}</p>
        <nav aria-label={ru ? "Путь адепта" : "The Adept’s path"}>
          <a className="btn" href={`/${lang}/quiz/`} onClick={() => rememberQuiz()}>{ru ? "Пройти Инициацию" : "Pass the Initiation"}</a>
          <a className="btn" href={`/${lang}/manifesto/`}>{ru ? "Читать Манифест" : "Read the Manifesto"}</a>
        </nav>
      </footer>}
    </div>
  );
};
