import React, { useEffect, useState } from "react";
import {
  MotionTrial,
  type MotionTrialKind,
  type MotionTrialLang,
  type MotionTrialResult,
} from "./MotionTrial";
import "./AdeptGames.css";

type Scores = Partial<Record<MotionTrialKind, number>>;

const ui = {
  ru: {
    kicker: "Практика адепта",
    title: "Испытания формы",
    intro:
      "Два упражнения на собранность. Выберите испытание: каждое можно проходить в любом порядке и повторять без ограничений.",
    chalazaTitle: "Халаза-тест",
    chalazaDescription:
      "Поймайте центр и удержите форму, пока её уводит невидимый дрейф.",
    oracleTitle: "Оракул желтка",
    oracleDescription:
      "Задайте вопрос, найдите ритм трёх точных встряхиваний и получите предсказание на языке Справочника.",
    begin: "Начать",
    best: "Лучший результат",
    back: "К выбору испытаний",
  },
  en: {
    kicker: "The Adept's practice",
    title: "Trials of Form",
    intro:
      "Two exercises in composure. Choose either trial, complete them in any order, and return as often as you wish.",
    chalazaTitle: "The Chalaza Test",
    chalazaDescription:
      "Catch the centre and hold the form while an unseen drift pulls it away.",
    oracleTitle: "Oracle of the Yolk",
    oracleDescription:
      "Ask a question, find the rhythm of three precise shakes, and receive a prophecy in the language of the Guide.",
    begin: "Begin",
    best: "Best result",
    back: "Choose another trial",
  },
} as const;

const STORAGE_KEY = "egg_motion_trials_v1";

export const AdeptGames: React.FC<{ lang: MotionTrialLang }> = ({ lang }) => {
  const text = ui[lang];
  const [active, setActive] = useState<MotionTrialKind | null>(null);
  const [scores, setScores] = useState<Scores>({});

  useEffect(() => {
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
          <MotionTrial
            key={active}
            kind={active}
            lang={lang}
            onComplete={saveResult}
          />
        </div>
      ) : (
        <div className="adept-games-grid">
          {(["chalaza", "oracle"] as const).map((kind) => (
            <article className="adept-game-card" key={kind}>
              <span className="adept-game-mark">
                {kind === "chalaza" ? "Ⅰ" : "Ⅱ"}
              </span>
              <h2>
                {kind === "chalaza" ? text.chalazaTitle : text.oracleTitle}
              </h2>
              <p>
                {kind === "chalaza"
                  ? text.chalazaDescription
                  : text.oracleDescription}
              </p>
              {scores[kind] ? (
                <small>
                  {text.best}: {scores[kind]} / 100
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
