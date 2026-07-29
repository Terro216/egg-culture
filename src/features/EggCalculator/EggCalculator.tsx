import React, { useEffect, useRef, useState } from "react";
import { CeremonyAudio } from "./ceremonyAudio";

type Size = "S" | "M" | "L";
type Temp = "fridge" | "room";
type Doneness = "soft" | "medium" | "hard";
type CeremonyState = "idle" | "running" | "paused" | "done";

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
    phaseLabel: string;
    phases: { name: string; text: string }[];
    finishTitle: string;
    finishText: string;
    soundOn: string;
    soundOff: string;
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
  const [size, setSize] = useState<Size>("M");
  const [temp, setTemp] = useState<Temp>("fridge");
  const [doneness, setDoneness] = useState<Doneness>("soft");

  const [ceremony, setCeremony] = useState<CeremonyState>("idle");
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);

  const [soundOn, setSoundOn] = useState(true);

  const endAtRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<CeremonyAudio | null>(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const getAudio = () => {
    if (!audioRef.current) audioRef.current = new CeremonyAudio();
    return audioRef.current;
  };

  const totalSeconds = calculateTimeSeconds(size, temp, doneness);

  const stopInterval = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopInterval();
      audioRef.current?.dispose();
      audioRef.current = null;
    },
    [],
  );

  const startInterval = () => {
    stopInterval();
    intervalRef.current = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        stopInterval();
        setRemainingMs(0);
        setCeremony("done");
        audioRef.current?.stop();
        if (soundOnRef.current) audioRef.current?.finale();
        if (typeof navigator !== "undefined") navigator.vibrate?.([220, 90, 220]);
        return;
      }
      setRemainingMs(left);
    }, 200);
  };

  const startCeremony = () => {
    const ms = totalSeconds * 1000;
    setTotalMs(ms);
    setRemainingMs(ms);
    endAtRef.current = Date.now() + ms;
    setCeremony("running");
    startInterval();
    if (soundOn) {
      const audio = getAudio();
      audio.start();
      audio.chime(660);
    }
  };

  const pauseCeremony = () => {
    stopInterval();
    setRemainingMs(Math.max(0, endAtRef.current - Date.now()));
    setCeremony("paused");
    audioRef.current?.suspend();
  };

  const resumeCeremony = () => {
    endAtRef.current = Date.now() + remainingMs;
    setCeremony("running");
    startInterval();
    if (soundOn) {
      const audio = getAudio();
      audio.resume();
      audio.start();
    }
  };

  const resetCeremony = () => {
    stopInterval();
    setCeremony("idle");
    setRemainingMs(0);
    setTotalMs(0);
    audioRef.current?.stop();
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (!next) {
      audioRef.current?.stop();
    } else if (ceremony === "running") {
      const audio = getAudio();
      audio.resume();
      audio.start();
    }
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

  const prevPhaseRef = useRef(0);
  useEffect(() => {
    if (ceremony !== "running") {
      prevPhaseRef.current = phaseIndex;
      return;
    }
    if (phaseIndex > prevPhaseRef.current && soundOnRef.current) {
      // Смена фазы церемонии — колокол чуть выше с каждой фазой.
      audioRef.current?.chime(660 + phaseIndex * 110, 0.1);
    }
    prevPhaseRef.current = phaseIndex;
  }, [phaseIndex, ceremony]);

  const buttonStyle = (isActive: boolean) => ({
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    border: "1px solid var(--color-yolk, var(--accent-color, #d4af37))",
    cursor: "pointer",
    backgroundColor: isActive
      ? "var(--color-yolk, var(--accent-color, #d4af37))"
      : "transparent",
    color: isActive
      ? "var(--color-shell, var(--bg-color, #F0EAD6))"
      : "var(--color-text, #2b2b2b)",
    fontFamily: "var(--font-sans-ui, sans-serif)",
    transition: "all 0.3s ease",
  });

  const actionButtonStyle: React.CSSProperties = {
    ...buttonStyle(true),
    flex: 1,
  };
  const ghostButtonStyle: React.CSSProperties = {
    ...buttonStyle(false),
    flex: 1,
  };

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
      <div className="egg-calculator-container">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3
            style={{
              color: "var(--color-yolk, var(--accent-color, #d4af37))",
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
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {(["S", "M", "L"] as Size[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    style={{ ...buttonStyle(size === s), flex: 1 }}
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
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => setTemp("fridge")}
                  style={{ ...buttonStyle(temp === "fridge"), flex: 1 }}
                >
                  {dict.tempFridge}
                </button>
                <button
                  onClick={() => setTemp("room")}
                  style={{ ...buttonStyle(temp === "room"), flex: 1 }}
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
                  onClick={() => setDoneness("soft")}
                  style={buttonStyle(doneness === "soft")}
                >
                  {dict.doneSoft}
                </button>
                <button
                  onClick={() => setDoneness("medium")}
                  style={buttonStyle(doneness === "medium")}
                >
                  {dict.doneMedium}
                </button>
                <button
                  onClick={() => setDoneness("hard")}
                  style={buttonStyle(doneness === "hard")}
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
                  color: "var(--color-yolk, var(--accent-color, #d4af37))",
                  margin: 0,
                  fontFamily: "var(--font-serif-headers, serif)",
                }}
              >
                {Math.floor(totalSeconds / 60)} {dict.minutes}{" "}
                {totalSeconds % 60 > 0
                  ? `${totalSeconds % 60} ${dict.seconds}`
                  : ""}
              </p>
              <button onClick={startCeremony} style={actionButtonStyle}>
                {dict.startCeremony}
              </button>
              <button
                onClick={toggleSound}
                className="text-ui"
                style={{ opacity: 0.6, fontSize: "0.8rem" }}
              >
                {soundOn ? dict.soundOn : dict.soundOff}
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
                {dict.ceremonyLabel} · {dict.phaseLabel} {phaseIndex + 1}/
                {dict.phases.length} · {phase.name}
              </p>
              <p
                className="ceremony-clock"
                style={{
                  fontWeight: 600,
                  color: "var(--color-yolk, var(--accent-color, #d4af37))",
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
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {ceremony === "running" ? (
                  <button onClick={pauseCeremony} style={ghostButtonStyle}>
                    {dict.pause}
                  </button>
                ) : (
                  <button onClick={resumeCeremony} style={actionButtonStyle}>
                    {dict.resume}
                  </button>
                )}
                <button onClick={resetCeremony} style={ghostButtonStyle}>
                  {dict.reset}
                </button>
              </div>
              <button
                onClick={toggleSound}
                className="text-ui"
                style={{ opacity: 0.6, fontSize: "0.8rem" }}
              >
                {soundOn ? dict.soundOn : dict.soundOff}
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
                  color: "var(--color-yolk, var(--accent-color, #d4af37))",
                  margin: 0,
                  fontFamily: "var(--font-serif-headers, serif)",
                }}
              >
                0:00
              </p>
              <p style={{ fontStyle: "italic", opacity: 0.85, margin: 0 }}>
                {dict.finishText}
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <button onClick={startCeremony} style={actionButtonStyle}>
                  {dict.startCeremony}
                </button>
                <button onClick={resetCeremony} style={ghostButtonStyle}>
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
