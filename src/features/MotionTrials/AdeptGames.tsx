import React, { lazy, Suspense, useEffect, useState } from "react";
import type {
  MotionTrialKind,
  MotionTrialLang,
  MotionTrialResult,
} from "./MotionTrial";
import { readPointsBest } from "../EggRoad/storage";
import "./AdeptGames.css";

type Scores = Partial<Record<MotionTrialKind, number>>;
type GameKind = MotionTrialKind | "road";
const MotionTrial = lazy(() => import("./MotionTrial").then((module) => ({ default: module.MotionTrial })));
const EggRoad = lazy(() => import("../EggRoad/EggRoad"));

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
      "Равновесие, восприятие и движение. Выберите испытание: каждое можно проходить в любом порядке и повторять без ограничений.",
    chalazaTitle: "Халаза-тест",
    chalazaDescription:
      "Поймайте центр и удержите форму, пока её уводит невидимый дрейф.",
    oracleTitle: "Оракул желтка",
    oracleDescription:
      "Задайте вопрос, найдите ритм трёх точных встряхиваний и получите предсказание на языке Справочника.",
    roadTitle: "Путь формы",
    roadDescription: "Катите яйцо по дороге над Пустотой. Ловите повороты и срезайте путь через нижние витки.",
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
      "Balance, perception, and motion. Choose a trial, complete them in any order, and return as often as you wish.",
    chalazaTitle: "The Chalaza Test",
    chalazaDescription:
      "Catch the centre and hold the form while an unseen drift pulls it away.",
    oracleTitle: "Oracle of the Yolk",
    oracleDescription:
      "Ask a question, find the rhythm of three precise shakes, and receive a prophecy in the language of the Guide.",
    roadTitle: "Path of Form",
    roadDescription: "Roll an egg along the road above the Void. Catch the bends and take shortcuts through the lower turns.",
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

export const AdeptGames: React.FC<{ lang: MotionTrialLang }> = ({ lang }) => {
  const text = ui[lang];
  const [active, setActive] = useState<GameKind | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [roadBest, setRoadBest] = useState(0);

  useEffect(() => {
    setRoadBest(readPointsBest("endless"));
    if (new URL(window.location.href).searchParams.has("road")) setActive("road");
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setScores(JSON.parse(stored) as Scores);
    } catch {
      // A blocked or malformed localStorage must not prevent play.
    }
  }, []);

  const saveResult = ({ kind, score }: MotionTrialResult) => {
    setScores((current) => {
      const next = { ...current, [kind]: Math.max(current[kind] ?? 0, score) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Progress is optional and remains in memory when storage is unavailable.
      }
      return next;
    });
    return true;
  };

  return (
    <section className="adept-games">
      <header className="adept-games-header">
        <p>{text.kicker}</p>
        <h1>{text.title}</h1>
        <span>{text.intro}</span>
      </header>

      {active ? (
        <div className="adept-game-active">
          <button
            className="adept-games-back"
            type="button"
            onClick={() => setActive(null)}
          >
            ← {text.back}
          </button>
          <GameBoundary key={active} message={text.loadError}>
            <Suspense fallback={<p role="status">{text.loading}</p>}>
              {active === "road" ? (
                <EggRoad lang={lang} onClose={() => { setRoadBest(readPointsBest("endless")); setActive(null); }} onComplete={(result) => { if (result.mode === "endless") setRoadBest((best) => Math.max(best, result.score)); }} />
              ) : (
                <MotionTrial key={active} kind={active} lang={lang} onComplete={saveResult} />
              )}
            </Suspense>
          </GameBoundary>
        </div>
      ) : (
        <div className="adept-games-grid">
          {(["chalaza", "oracle", "road"] as const).map((kind) => (
            <article className="adept-game-card" key={kind}>
              <span className="adept-game-mark">
                {kind === "chalaza" ? "Ⅰ" : kind === "oracle" ? "Ⅱ" : "Ⅲ"}
              </span>
              <h2>
                {kind === "chalaza" ? text.chalazaTitle : kind === "oracle" ? text.oracleTitle : text.roadTitle}
              </h2>
              <p>
                {kind === "chalaza"
                  ? text.chalazaDescription
                  : kind === "oracle" ? text.oracleDescription : text.roadDescription}
              </p>
              {(kind === "road" ? roadBest : scores[kind]) ? (
                <small>
                  {kind === "road" ? text.endlessBest : text.best}: {kind === "road" ? `${roadBest} ${text.gates}` : `${scores[kind]} / 100`}
                </small>
              ) : null}
              <button type="button" onClick={() => setActive(kind)}>
                {text.begin}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
