import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoadEngine } from "./engine.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import { readRoadBest, ROAD_STORAGE_KEY } from "./storage.ts";
import "./EggRoad.css";

export type EggRoadLang = "ru" | "en";

const copy = {
  ru: {
    title: "Путь формы", kicker: "Третье испытание", intro: "Удерживайте яйцо на дороге. Падайте на нижние витки, чтобы срезать путь.",
    character: "Форма яйца меняет каждый поворот и приземление.",
    controls: "Удерживайте левую или правую сторону экрана", keyboard: "← → или A / D · P — пауза · R — заново",
    start: "Начать спуск", loading: "Дорога принимает форму…", close: "К испытаниям", pause: "Пауза", resume: "Продолжить",
    paused: "Температурная Пауза", pausedText: "Дорога подождёт. Продолжайте, когда будете готовы.",
    over: "Форма потеряна", overText: "Новая попытка начинается с первого витка.",
    finished: "Путь пройден", finishedText: "Все четыре витка остались позади.",
    retry: "Ещё один спуск", best: "Рекорд", score: "Отметки", skipped: "Срезано", bestSkip: "Лучшая срезка",
    newBest: "Новый рекорд", air: "Найдите дорогу", shortcut: "Срезано отметок", left: "Повернуть влево", right: "Повернуть вправо",
    soundOn: "Звук включён", soundOff: "Звук выключен", error: "Не удалось открыть дорогу", errorText: "Попробуйте открыть игру снова в браузере с поддержкой 3D-графики.",
  },
  en: {
    title: "Path of Form", kicker: "The third trial", intro: "Keep the egg on the road. Land on the lower turns to take a shortcut.",
    character: "The egg’s shape changes every turn and landing.",
    controls: "Hold the left or right side of the screen", keyboard: "← → or A / D · P to pause · R to restart",
    start: "Begin the descent", loading: "The road is taking form…", close: "Back to trials", pause: "Pause", resume: "Continue",
    paused: "A Temperature Pause", pausedText: "The road will wait. Continue when you are ready.",
    over: "Form lost", overText: "The next attempt begins at the first turn.",
    finished: "The path is complete", finishedText: "All four turns lie behind you.",
    retry: "Another descent", best: "Best", score: "Gates", skipped: "Skipped", bestSkip: "Best shortcut",
    newBest: "New best", air: "Find the road", shortcut: "Gates skipped", left: "Steer left", right: "Steer right",
    soundOn: "Sound on", soundOff: "Sound off", error: "The road could not open", errorText: "Try opening the game again in a browser that supports 3D graphics.",
  },
} as const;

const initialSnapshot: RoadSnapshot = {
  phase: "ready", score: 0, skipped: 0, bestSkip: 0, seconds: 0, finished: false,
  speed: 0, airborne: false, flightLeft: 4.2, progress: 0, lastSkip: 0,
};

export default function EggRoad({ lang, onClose, onComplete }: {
  lang: EggRoadLang;
  onClose: () => void;
  onComplete?: (result: RoadResult) => void;
}) {
  const ui = copy[lang];
  const canvasHost = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const engine = useRef<RoadEngine | null>(null);
  const heldPointers = useRef(new Map<number, number>());
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);
  const [newBest, setNewBest] = useState(false);
  const [pressed, setPressed] = useState(0);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    modal.current?.focus();
    bestRef.current = readRoadBest();
    setBest(bestRef.current);
    try {
      mutedRef.current = JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "null")?.muted !== false;
      setMuted(mutedRef.current);
    } catch { /* Storage is optional. */ }
    const abort = new AbortController();
    let instance: RoadEngine | null = null;
    void import("./engine.ts").then(({ createRoadEngine }) => {
      if (abort.signal.aborted || !canvasHost.current) return null;
      return createRoadEngine(canvasHost.current, {
        update: setSnapshot,
        failure: () => setError(true),
        complete: (result) => {
          setNewBest(result.score > bestRef.current);
          bestRef.current = Math.max(bestRef.current, result.score);
          setBest(bestRef.current);
          try {
            localStorage.setItem(ROAD_STORAGE_KEY, JSON.stringify({ best: bestRef.current, muted: mutedRef.current }));
          } catch { /* A result stays visible even if storage is blocked. */ }
          completeRef.current?.(result);
        },
      }, abort.signal);
    }).then((created) => {
      if (!created) return;
      if (abort.signal.aborted) { created.dispose(); return; }
      instance = created;
      engine.current = created;
      created.setMuted(mutedRef.current);
      setReady(true);
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => {
      abort.abort();
      instance?.dispose();
      engine.current = null;
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    // The focused menu button may have just disappeared after starting/resuming.
    modal.current?.focus();
    if (snapshot.phase !== "running") { heldPointers.current.clear(); setPressed(0); engine.current?.steer(0); }
  }, [snapshot.phase]);

  const updateSteering = () => {
    const values = [...heldPointers.current.values()];
    const steering = Number(values.includes(1)) - Number(values.includes(-1));
    engine.current?.steer(steering);
    setPressed(steering);
  };
  const toggleSound = () => {
    const value = !mutedRef.current;
    mutedRef.current = value;
    setMuted(value);
    engine.current?.setMuted(value);
    try { localStorage.setItem(ROAD_STORAGE_KEY, JSON.stringify({ best: bestRef.current, muted: value })); } catch { /* Optional. */ }
  };
  const play = () => { setNewBest(false); engine.current?.play(); };
  const ended = snapshot.phase === "over" || snapshot.phase === "finished";
  const showPanel = !ready || error || snapshot.phase !== "running";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="egg-road" role="dialog" aria-modal="true" aria-label={ui.title} tabIndex={-1} ref={modal}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = [...(modal.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled]):not([tabindex='-1'])") ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="egg-road-scene" ref={canvasHost} />
      <div className="egg-road-vignette" aria-hidden="true" />
      <header className="egg-road-hud">
        <button className="egg-road-icon egg-road-exit" type="button" onClick={onClose} aria-label={ui.close}>←</button>
        <div className="egg-road-score">
          <span>{ui.title}</span>
          <strong>{String(snapshot.score).padStart(2, "0")}</strong>
          <small>{ui.best} {best}</small>
        </div>
        <button className="egg-road-icon" type="button" onClick={() => engine.current?.pause()} disabled={!ready || snapshot.phase !== "running"} aria-label={ui.pause}>Ⅱ</button>
      </header>

      {!showPanel && <>
        {([-1, 1] as const).map((direction) => (
          <button key={direction} type="button" tabIndex={-1}
            className={`egg-road-steer ${direction < 0 ? "is-left" : "is-right"} ${pressed === direction ? "is-held" : ""}`}
            aria-label={direction < 0 ? ui.left : ui.right}
            onPointerDown={(event) => {
              event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
              heldPointers.current.set(event.pointerId, direction); updateSteering();
            }}
            onPointerUp={(event) => { heldPointers.current.delete(event.pointerId); updateSteering(); }}
            onPointerCancel={(event) => { heldPointers.current.delete(event.pointerId); updateSteering(); }}
            onLostPointerCapture={(event) => { heldPointers.current.delete(event.pointerId); updateSteering(); }}>
            <span aria-hidden="true">{direction < 0 ? "‹" : "›"}</span>
          </button>
        ))}
        <div className={`egg-road-flight ${snapshot.airborne ? "is-visible" : ""}`}>
          <span>{ui.air}</span><strong>{snapshot.flightLeft.toFixed(1)}</strong>
          <div><i style={{ transform: `scaleX(${snapshot.flightLeft / 4.2})` }} /></div>
        </div>
        {snapshot.lastSkip > 0 && <div className="egg-road-shortcut" role="status">{ui.shortcut} <b>+{snapshot.lastSkip}</b></div>}
        <div className="egg-road-key-hint">{ui.keyboard}</div>
      </>}

      {showPanel && <div className="egg-road-overlay">
        <section className="egg-road-panel">
          <p className="egg-road-kicker">{ui.kicker}</p>
          <h1>{error ? ui.error : snapshot.phase === "paused" ? ui.paused : ended ? snapshot.finished ? ui.finished : ui.over : ui.title}</h1>
          <p className="egg-road-intro">{error ? ui.errorText : snapshot.phase === "paused" ? ui.pausedText : ended ? snapshot.finished ? ui.finishedText : ui.overText : ui.intro}</p>
          {ended ? <>
            <div className="egg-road-result">
              <strong>{snapshot.score}<span>{ui.score}</span></strong>
              <dl><div><dt>{ui.skipped}</dt><dd>{snapshot.skipped}</dd></div><div><dt>{ui.bestSkip}</dt><dd>{snapshot.bestSkip}</dd></div></dl>
            </div>
            {newBest && <p className="egg-road-record">{ui.newBest}</p>}
          </> : !error && snapshot.phase === "ready" && <div className="egg-road-instructions">
            <span aria-hidden="true">‹ <i>◒</i> ›</span>
            <p>{ui.controls}</p><small>{ui.keyboard}</small>
            <p className="egg-road-character">{ui.character}</p>
          </div>}
          {!error && <button className="egg-road-primary" type="button" disabled={!ready} onClick={play}>
            {!ready ? ui.loading : snapshot.phase === "paused" ? ui.resume : ended ? ui.retry : ui.start}<span aria-hidden="true">↗</span>
          </button>}
          <div className="egg-road-panel-footer">
            <button type="button" onClick={onClose}>{ui.close}</button>
            {!error && <button type="button" onClick={toggleSound} aria-pressed={!muted}>{muted ? ui.soundOff : ui.soundOn}</button>}
          </div>
        </section>
      </div>}
      <div className="egg-road-progress" aria-hidden="true"><i style={{ transform: `scaleX(${snapshot.progress})` }} /></div>
    </div>, document.body,
  );
}
