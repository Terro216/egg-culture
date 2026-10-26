import React, { useEffect, useRef, useState } from "react";
import { CeremonyAudio } from "./ceremonyAudio";

import {
  CALCULATOR_STORAGE_KEY,
  defaultCalculatorState,
  loadCalculatorState,
  remainingCalculatorMs,
  saveCalculatorState,
  type CalculatorState,
  type Size,
  type Temp,
  type Doneness,
} from "./calculatorState";

export interface EggCalculatorProps {
  dict: {
    title: string;
    subtitle: string;
    caliber: string;
    sizeS: string;
    sizeM: string;
    sizeL: string;
    temp: string;
    tempFridge: string;
    tempRoom: string;
    doneness: string;
    doneSoft: string;
    doneMedium: string;
    doneHard: string;
    resultLabel: string;
    minutes: string;
    seconds: string;
    startCeremony: string;
    pause: string;
    resume: string;
    reset: string;
    ceremonyLabel: string;
    pausedLabel: string;
    phaseLabel: string;
    phases: { name: string; text: string }[];
    finishTitle: string;
    finishText: string;
    soundOn: string;
    soundOff: string;
    enableSound: string;
  };
}

// Базовые времена (сек) для яйца C1 (~58 г) из холодильника в кипятке.
const BASE_TIMES: Record<Doneness, number> = {
  soft: 360, // 6 мин
  medium: 480, // 8 мин
  hard: 600, // 10 мин
};

// Время варки масштабируется как масса^(2/3) (формула Williams):
// C2 ~50 г и C0 ~68 г относительно C1 ~58 г.
const SIZE_FACTOR: Record<Size, number> = {
  S: 0.9,
  M: 1,
  L: 1.11,
};

// Разница старта 4°C → 20°C дает почти постоянную экономию времени
// K·ln((100-4)/(100-20)) ≈ 75 сек независимо от степени готовности.
const ROOM_TEMP_BONUS_S = 75;

// Границы фаз церемонии в долях от полного времени.
const PHASE_BOUNDS = [0.12, 0.45, 0.78, 1];

function calculateTimeSeconds(size: Size, temp: Temp, doneness: Doneness) {
  let time = BASE_TIMES[doneness] * SIZE_FACTOR[size];
  if (temp === "room") time -= ROOM_TEMP_BONUS_S;
  return Math.max(120, Math.round(time));
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function EggCalculator({ dict }: EggCalculatorProps) {
  // The server and first client render are identical; browser state is restored
  // after hydration, before the controls become available.
  const [state, setState] = useState(defaultCalculatorState);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [soundReady, setSoundReady] = useState(false);
  const stateRef = useRef(state);
  const audioRef = useRef<CeremonyAudio | null>(null);
  const unsavedRef = useRef(false);
  const { size, temp, doneness, ceremony, totalMs, soundOn } = state;
  const remainingMs = remainingCalculatorMs(state, now);

  const withAudio = (action: (audio: CeremonyAudio) => void) => {
    try {
      if (audioRef.current) action(audioRef.current);
    } catch {
      // A browser audio restriction must never interrupt the cooking timer.
    }
  };

  const startAudio = (chime = false) => {
    if (!audioRef.current) audioRef.current = new CeremonyAudio();
    const audio = audioRef.current;
    void audio.activate().then((available) => {
      if (audioRef.current !== audio) return;
      setSoundReady(available);
      if (!available || stateRef.current.ceremony !== "running" || !stateRef.current.soundOn) return;
      withAudio((activeAudio) => {
        activeAudio.start();
        if (chime) activeAudio.chime(660);
      });
    });
  };

  const applyState = (next: CalculatorState) => {
    stateRef.current = next;
    setNow(Date.now());
    setState(next);
  };

  const commitState = (next: CalculatorState) => {
    applyState(next);
    try {
      unsavedRef.current = !saveCalculatorState(window.localStorage, next);
    } catch {
      unsavedRef.current = true;
      // Access to localStorage itself can be blocked in private browser modes.
    }
  };

  const restoreState = () => {
    if (unsavedRef.current) return null;
    try {
      const stored = loadCalculatorState(window.localStorage, Date.now());
      if (stored) {
        applyState(stored);
        return stored;
      }
    } catch {
      // The current tab continues to work when browser storage is unavailable.
    }
    return null;
  };

  useEffect(() => {
    restoreState();
    setNow(Date.now());
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CALCULATOR_STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea !== window.localStorage) return;
        // Read the current value: several queued events may describe old states.
        if (!restoreState() && window.localStorage.getItem(CALCULATOR_STORAGE_KEY) === null) {
          applyState(defaultCalculatorState());
        }
        withAudio((audio) => audio.stop());
        setSoundReady(false);
      } catch {
        // Storage access may be revoked while the page is open.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        restoreState();
        setNow(Date.now());
      }
    };
    const onPageShow = () => {
      restoreState();
      setNow(Date.now());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      withAudio((audio) => audio.dispose());
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!soundOn || ceremony === "idle" || ceremony === "done") {
      withAudio((audio) => audio.stop());
      setSoundReady(false);
    } else if (ceremony === "paused") {
      withAudio((audio) => audio.suspend());
      setSoundReady(false);
    } else {
      // Reloaded pages may resume Web Audio only after another user gesture.
      startAudio();
    }
  }, [ready, ceremony, soundOn]);

  useEffect(() => {
    if (!ready || ceremony !== "running") return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      const current = stateRef.current;
      if (current.ceremony !== "running" || current.endAt > time) return;
      // A suspended tab must not finish over a pause/reset made in another tab.
      const stored = restoreState();
      if (stored && (stored.ceremony !== "done" || stored.totalMs !== current.totalMs)) return;
      commitState({ ...(stored ?? current), ceremony: "done", remainingMs: 0, endAt: 0 });
      withAudio((audio) => {
        audio.stop();
        if (stateRef.current.soundOn) audio.finale();
      });
      try { navigator.vibrate?.([220, 90, 220]); } catch { /* Optional browser feedback. */ }
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [ready, ceremony, state.endAt, totalMs]);

  const totalSeconds = calculateTimeSeconds(size, temp, doneness);
  const startCeremony = () => {
    const ms = totalSeconds * 1000;
    commitState({ ...stateRef.current, totalMs: ms, remainingMs: ms, endAt: Date.now() + ms, ceremony: "running" });
    if (soundOn) startAudio(true);
  };

  const pauseCeremony = () => {
    const left = remainingCalculatorMs(stateRef.current, Date.now());
    commitState({ ...stateRef.current, remainingMs: left, endAt: 0, ceremony: left > 0 ? "paused" : "done" });
    withAudio((audio) => audio.suspend());
  };

  const resumeCeremony = () => {
    const current = stateRef.current;
    commitState({ ...current, endAt: Date.now() + current.remainingMs, ceremony: "running" });
    if (soundOn) startAudio();
  };

  const resetCeremony = () => {
    commitState({ ...stateRef.current, ceremony: "idle", remainingMs: 0, totalMs: 0, endAt: 0 });
    withAudio((audio) => audio.stop());
  };

  const toggleSound = () => {
    if (stateRef.current.soundOn && ceremony === "running" && !soundReady) {
      startAudio();
      return;
    }
    const next = !stateRef.current.soundOn;
    commitState({ ...stateRef.current, soundOn: next });
    if (!next) withAudio((audio) => audio.stop());
    else if (ceremony === "running") startAudio();
  };

  const elapsedFraction =
    totalMs > 0 ? Math.min(1, (totalMs - remainingMs) / totalMs) : 0;
  const phaseIndex = Math.min(
    PHASE_BOUNDS.findIndex((bound) => elapsedFraction <= bound) === -1
      ? PHASE_BOUNDS.length - 1
      : PHASE_BOUNDS.findIndex((bound) => elapsedFraction <= bound),
    dict.phases.length - 1,
  );
  const phase = dict.phases[phaseIndex];
  const ceremonyActive = ceremony === "running" || ceremony === "paused";
  const soundLabel = soundOn
    ? ceremony === "running" && !soundReady ? dict.enableSound : dict.soundOn
    : dict.soundOff;

  const prevPhaseRef = useRef(0);
  useEffect(() => {
    if (ceremony !== "running") {
      prevPhaseRef.current = phaseIndex;
      return;
    }
    if (phaseIndex > prevPhaseRef.current && stateRef.current.soundOn) {
      // Смена фазы церемонии — колокол чуть выше с каждой фазой.
      withAudio((audio) => audio.chime(660 + phaseIndex * 110, 0.1));
    }
    prevPhaseRef.current = phaseIndex;
  }, [phaseIndex, ceremony]);

  return (
    <>
      <style>{`
        .egg-calculator-container {
          padding: 2rem;
          border: 1px solid var(--border-color, rgba(43,43,43,0.1));
          max-width: 600px;
          margin: 0 auto;
          background-color: rgba(255, 255, 255, 0.3);
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .calculator-choice-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        @media (max-width: 480px) {
          .calculator-choice-row { flex-direction: column; gap: 0.5rem; }
        }
        .egg-calculator-result {
          font-size: 3rem !important;
        }
        .ceremony-clock {
          font-size: 4rem !important;
          font-variant-numeric: tabular-nums;
        }
        .ceremony-progress {
          height: 4px;
          background: rgba(212, 175, 55, 0.2);
          overflow: hidden;
        }
        .ceremony-progress > span {
          display: block;
          height: 100%;
          background: var(--color-yolk, #d4af37);
          transform-origin: left center;
          transition: transform 0.25s linear;
        }
        @media (max-width: 768px) {
          .egg-calculator-container {
            padding: 1rem;
            gap: 1.5rem;
          }
          .egg-calculator-result {
            font-size: 2rem !important;
          }
          .ceremony-clock {
            font-size: 3rem !important;
          }
        }
      `}</style>
      <div className="egg-calculator-container" data-ready={ready} data-ceremony={ceremony}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3
            style={{
              color: "var(--color-yolk-text, #80600f)",
              fontSize: "2rem",
              margin: 0,
              textAlign: "center",
            }}
          >
            {dict.title}
          </h3>
          <p
            style={{
              fontStyle: "italic",
              opacity: 0.8,
              margin: 0,
              textAlign: "center",
            }}
          >
            {dict.subtitle}
          </p>
        </div>

        {!ceremonyActive && ceremony !== "done" && (
          <>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{dict.caliber}</p>
              <div className="calculator-choice-row">
                {(["S", "M", "L"] as Size[]).map((s) => (
                  <button
                    disabled={!ready}
                    key={s}
                    onClick={() => commitState({ ...stateRef.current, size: s })}
                    aria-pressed={size === s}
                    className="btn btn-secondary" style={{ flex: 1 }}
                  >
                    {s === "S" && dict.sizeS}
                    {s === "M" && dict.sizeM}
                    {s === "L" && dict.sizeL}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{dict.temp}</p>
              <div className="calculator-choice-row">
                <button
                  disabled={!ready}
                  onClick={() => commitState({ ...stateRef.current, temp: "fridge" })}
                  aria-pressed={temp === "fridge"}
                  className="btn btn-secondary" style={{ flex: 1 }}
                >
                  {dict.tempFridge}
                </button>
                <button
                  disabled={!ready}
                  onClick={() => commitState({ ...stateRef.current, temp: "room" })}
                  aria-pressed={temp === "room"}
                  className="btn btn-secondary" style={{ flex: 1 }}
                >
                  {dict.tempRoom}
                </button>
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{dict.doneness}</p>
              <div
                style={{ display: "flex", gap: "1rem", flexDirection: "column" }}
              >
                <button
                  disabled={!ready}
                  onClick={() => commitState({ ...stateRef.current, doneness: "soft" })}
                  aria-pressed={doneness === "soft"}
                  className="btn btn-secondary"
                >
                  {dict.doneSoft}
                </button>
                <button
                  disabled={!ready}
                  onClick={() => commitState({ ...stateRef.current, doneness: "medium" })}
                  aria-pressed={doneness === "medium"}
                  className="btn btn-secondary"
                >
                  {dict.doneMedium}
                </button>
                <button
                  disabled={!ready}
                  onClick={() => commitState({ ...stateRef.current, doneness: "hard" })}
                  aria-pressed={doneness === "hard"}
                  className="btn btn-secondary"
                >
                  {dict.doneHard}
                </button>
              </div>
            </div>
          </>
        )}

        <div
          style={{
            padding: "2rem",
            backgroundColor: "rgba(212, 175, 55, 0.1)",
            border:
              "1px dashed var(--color-yolk, var(--accent-color, #d4af37))",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          {ceremony === "idle" && (
            <>
              <p
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.8,
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {dict.resultLabel}
              </p>
              <p
                className="egg-calculator-result"
                style={{
                  fontWeight: 600,
                  color: "var(--color-yolk-text, #80600f)",
                  margin: 0,
                  fontFamily: "var(--font-serif-headers, serif)",
                }}
              >
                {Math.floor(totalSeconds / 60)} {dict.minutes}{" "}
                {totalSeconds % 60 > 0
                  ? `${totalSeconds % 60} ${dict.seconds}`
                  : ""}
              </p>
              <button disabled={!ready} onClick={startCeremony} className="btn" style={{ flex: 1 }}>
                {dict.startCeremony}
              </button>
              <button
                disabled={!ready}
                onClick={toggleSound}
                className="btn btn-link"
                aria-pressed={soundOn}
              >
                {soundLabel}
              </button>
            </>
          )}

          {ceremonyActive && (
            <>
              <p
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.8,
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {ceremony === "paused" ? dict.pausedLabel : dict.ceremonyLabel} · {dict.phaseLabel} {phaseIndex + 1}/
                {dict.phases.length} · {phase.name}
              </p>
              <p
                className="ceremony-clock"
                style={{
                  fontWeight: 600,
                  color: "var(--color-yolk-text, #80600f)",
                  margin: 0,
                  fontFamily: "var(--font-serif-headers, serif)",
                }}
              >
                {formatClock(Math.ceil(remainingMs / 1000))}
              </p>
              <div className="ceremony-progress" aria-hidden="true">
                <span style={{ transform: `scaleX(${elapsedFraction})` }} />
              </div>
              <p style={{ fontStyle: "italic", opacity: 0.85, margin: 0 }}>
                {phase.text}
              </p>
              <div className="calculator-choice-row">
                {ceremony === "running" ? (
                  <button disabled={!ready} onClick={pauseCeremony} className="btn btn-secondary" style={{ flex: 1 }}>
                    {dict.pause}
                  </button>
                ) : (
                  <button disabled={!ready} onClick={resumeCeremony} className="btn" style={{ flex: 1 }}>
                    {dict.resume}
                  </button>
                )}
                <button disabled={!ready} onClick={resetCeremony} className="btn btn-secondary" style={{ flex: 1 }}>
                  {dict.reset}
                </button>
              </div>
              <button
                disabled={!ready}
                onClick={toggleSound}
                className="btn btn-link"
                aria-pressed={soundOn}
              >
                {soundLabel}
              </button>
            </>
          )}

          {ceremony === "done" && (
            <>
              <p
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.8,
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {dict.finishTitle}
              </p>
              <p
                className="egg-calculator-result"
                style={{
                  fontWeight: 600,
                  color: "var(--color-yolk-text, #80600f)",
                  margin: 0,
                  fontFamily: "var(--font-serif-headers, serif)",
                }}
              >
                0:00
              </p>
              <p style={{ fontStyle: "italic", opacity: 0.85, margin: 0 }}>
                {dict.finishText}
              </p>
              <div className="calculator-choice-row">
                <button disabled={!ready} onClick={startCeremony} className="btn" style={{ flex: 1 }}>
                  {dict.startCeremony}
                </button>
                <button disabled={!ready} onClick={resetCeremony} className="btn btn-secondary" style={{ flex: 1 }}>
                  {dict.reset}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
