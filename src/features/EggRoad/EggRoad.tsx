import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoadEngine } from "./engine.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import type { GyroState } from "./camera.ts";
import { readRoadBest, ROAD_STORAGE_KEY } from "./storage.ts";
import "./EggRoad.css";

export type EggRoadLang = "ru" | "en";

const copy = {
  ru: {
    title: "Путь формы", kicker: "Третье испытание", intro: "Удерживайте яйцо на дороге. Падайте на нижние витки, чтобы срезать путь.",
    character: "Перекатывайте яйцо влево и вправо в ритме, чтобы разгоняться. Дайте ему качнуться перед сменой стороны.",
    controls: "Удерживайте левую или правую сторону экрана", keyboard: "← → или A / D · P — пауза · R — заново",
    start: "Начать спуск", loading: "Дорога принимает форму…", close: "К испытаниям", pause: "Пауза", resume: "Продолжить",
    paused: "Температурная Пауза", pausedText: "Дорога подождёт. Продолжайте, когда будете готовы.",
    over: "Форма потеряна", overText: "Новая попытка начинается с первого витка.",
    finished: "Путь пройден", finishedText: "Следующая дорога примет новую форму.",
    tutorial: "Учебная трасса", level: "Уровень", next: "Следующая дорога", practice: "Вернуться к учебной",
    flyby: "Взгляните на дорогу", skipFlyby: "К спуску", rhythm: "Ритм", speedUnit: "км/ч",
    look: "Обзор", lookDrag: "Обзор: удерживайте и двигайте пальцем", lookHint: "Обзор: потяните ◎ или удерживайте Q / E",
    gyroOff: "Обзор наклоном", gyroOn: "Наклон включён", gyroWaiting: "Ожидаем датчик…", gyroMissing: "Датчик недоступен. Для обзора потяните ◎.",
    retry: "Ещё один спуск", best: "Рекорд", score: "Отметки", skipped: "Срезано", bestSkip: "Лучшая срезка",
    newBest: "Новый рекорд", air: "Найдите дорогу", shortcut: "Срезано отметок", left: "Повернуть влево", right: "Повернуть вправо",
    soundOn: "Звук включён", soundOff: "Звук выключен", error: "Не удалось открыть дорогу", errorText: "Попробуйте открыть игру снова в браузере с поддержкой 3D-графики.",
  },
  en: {
    title: "Path of Form", kicker: "The third trial", intro: "Keep the egg on the road. Land on the lower turns to take a shortcut.",
    character: "Rock the egg left and right in rhythm to gain speed. Let it roll before changing sides.",
    controls: "Hold the left or right side of the screen", keyboard: "← → or A / D · P to pause · R to restart",
    start: "Begin the descent", loading: "The road is taking form…", close: "Back to trials", pause: "Pause", resume: "Continue",
    paused: "A Temperature Pause", pausedText: "The road will wait. Continue when you are ready.",
    over: "Form lost", overText: "The next attempt begins at the first turn.",
    finished: "The path is complete", finishedText: "The next road will take a new form.",
    tutorial: "Practice road", level: "Level", next: "The next road", practice: "Return to practice",
    flyby: "Take a look at the road", skipFlyby: "Start rolling", rhythm: "Rhythm", speedUnit: "km/h",
    look: "Look", lookDrag: "Look around: hold and drag", lookHint: "Look around: drag ◎ or hold Q / E",
    gyroOff: "Look by tilting", gyroOn: "Tilt enabled", gyroWaiting: "Waiting for sensor…", gyroMissing: "Sensor unavailable. Drag ◎ to look around.",
    retry: "Another descent", best: "Best", score: "Gates", skipped: "Skipped", bestSkip: "Best shortcut",
    newBest: "New best", air: "Find the road", shortcut: "Gates skipped", left: "Steer left", right: "Steer right",
    soundOn: "Sound on", soundOff: "Sound off", error: "The road could not open", errorText: "Try opening the game again in a browser that supports 3D graphics.",
  },
} as const;

const initialSnapshot: RoadSnapshot = {
  phase: "ready", score: 0, skipped: 0, bestSkip: 0, seconds: 0, finished: false,
  speed: 0, airborne: false, flightLeft: 4.2, progress: 0, lastSkip: 0,
  level: 1, boost: 0, rhythm: 0,
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
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
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
  const [gyro, setGyro] = useState<GyroState>("off");

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
        gyro: setGyro,
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
    if (snapshot.phase !== "running") {
      heldPointers.current.clear(); lookPointer.current = null; setPressed(0);
      engine.current?.steer(0); engine.current?.lookAround(0, 0);
    }
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
  const flyingIn = snapshot.phase === "intro";
  const showPanel = !ready || error || (snapshot.phase !== "running" && !flyingIn);
  const stopLooking = () => { lookPointer.current = null; engine.current?.lookAround(0, 0); };

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
        <button className="egg-road-icon egg-road-exit" type="button" onClick={onClose} aria-label={ui.close}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
        </button>
        <div className="egg-road-score">
          <span>{ui.title}</span>
          <strong>{String(snapshot.score).padStart(2, "0")}</strong>
          <small>{ui.best} {best}</small>
          <span className="egg-road-level">{snapshot.level === 1 ? ui.tutorial : `${ui.level} ${snapshot.level}`}</span>
          {!showPanel && !flyingIn && <div className="egg-road-notices">
            {snapshot.airborne ? <div className="egg-road-flight" role="status">
              <span>{ui.air}</span><strong>{snapshot.flightLeft.toFixed(1)}</strong>
              <div><i style={{ transform: `scaleX(${snapshot.flightLeft / 4.2})` }} /></div>
            </div> : snapshot.lastSkip > 0 ? <div className="egg-road-shortcut" role="status">{ui.shortcut} <b>+{snapshot.lastSkip}</b></div> : null}
          </div>}
        </div>
        <button className="egg-road-icon" type="button" onClick={() => engine.current?.pause()} disabled={!ready || (snapshot.phase !== "running" && !flyingIn)} aria-label={ui.pause}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
        </button>
      </header>

      {!showPanel && !flyingIn && <>
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
        <button className="egg-road-look" type="button" tabIndex={-1} aria-label={ui.lookDrag}
          onPointerDown={(event) => {
            if (lookPointer.current) return;
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
            lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            const start = lookPointer.current;
            if (start?.id === event.pointerId) engine.current?.lookAround((event.clientX - start.x) / 70, (event.clientY - start.y) / 70);
          }}
          onPointerUp={stopLooking} onPointerCancel={stopLooking} onLostPointerCapture={stopLooking}>
          <span aria-hidden="true">◎</span><small>{ui.look}</small>
        </button>
        <div className={`egg-road-rhythm ${snapshot.boost > 0.1 ? "is-charged" : ""}`}>
          <strong>{Math.round(snapshot.speed * 3.6)} <small>{ui.speedUnit}</small></strong>
          <div><i style={{ transform: `scaleX(${snapshot.boost})` }} /></div>
          <span>{ui.rhythm}{snapshot.rhythm > 0 ? ` · ${snapshot.rhythm}` : ""}</span>
        </div>
        <div className="egg-road-key-hint">{ui.keyboard}</div>
      </>}

      {!showPanel && flyingIn && <div className="egg-road-flyby">
        <p>{ui.flyby}</p>
        <button type="button" onClick={() => engine.current?.skipFlyby()}>{ui.skipFlyby} <span aria-hidden="true">↗</span></button>
      </div>}

      {showPanel && <div className="egg-road-overlay">
        <section className="egg-road-panel">
          <p className="egg-road-kicker">{snapshot.level === 1 ? ui.tutorial : `${ui.level} ${snapshot.level}`}</p>
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
            <small>{ui.lookHint}</small>
            <p className="egg-road-character">{ui.character}</p>
          </div>}
          {!error && <button className="egg-road-primary" type="button" disabled={!ready} onClick={play}>
            {!ready ? ui.loading : snapshot.phase === "paused" ? ui.resume : snapshot.finished ? ui.next : ended ? ui.retry : ui.start}<span aria-hidden="true">↗</span>
          </button>}
          {!error && ready && <div className="egg-road-options">
            <button type="button" aria-pressed={gyro === "on" || gyro === "waiting"} onClick={() => engine.current?.toggleGyro()}>{gyro === "on" ? ui.gyroOn : gyro === "waiting" ? ui.gyroWaiting : ui.gyroOff}</button>
            {snapshot.level > 1 && <button type="button" onClick={() => engine.current?.practice()}>{ui.practice}</button>}
            {gyro === "unavailable" && <p role="status">{ui.gyroMissing}</p>}
          </div>}
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
