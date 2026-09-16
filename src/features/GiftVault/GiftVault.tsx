import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MotionTrial,
  type MotionTrialLang,
} from "@features/MotionTrials/MotionTrial";
import "./GiftVault.css";

const gifts = [
  { id: "first-steep", number: "I", title: "Первая печать", shop: "Чайный дом №1" },
  { id: "second-dome", number: "II", title: "Вторая печать", shop: "Чайный дом №2" },
  { id: "third-yolk", number: "III", title: "Третья печать", shop: "Дело чайного гномика" },
] as const;

const ritualStages = [
  {
    kind: "pour" as const,
    giftId: "first-steep",
    title: "Чахай и пиала",
    intro: "Плавно поверните телефон, будто переливаете настой из чахая в пиалу. Главное — не перелить.",
  },
  {
    kind: "chalaza" as const,
    giftId: "second-dome",
    title: "Халаза-тест",
    intro: "Удержите яйцо в центре. Даже идеальная неподвижность не спасает: форма начнет укатываться, ее придется ловить наклоном.",
  },
  {
    kind: "oracle" as const,
    giftId: "third-yolk",
    title: "Оракул желтка",
    intro: "Сформулируйте вопрос. Оракулу нужны три точных встряхивания.",
  },
] as const;

type GiftStatus = "sealed" | "opening" | "opened" | "error";
type RitualMode = "locked" | "ready" | "calibrating" | "pouring" | "complete";
type Orientation = { alpha: number; beta: number; gamma: number };
type GiftState = {
  status: GiftStatus;
  message?: string;
  opened?: { certificate: string; note?: string };
};

const initialGiftState = gifts.reduce<Record<string, GiftState>>((acc, gift) => {
  acc[gift.id] = { status: "sealed" };
  return acc;
}, {});
const emptyOrientation: Orientation = { alpha: 0, beta: 0, gamma: 0 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const SensorReadout: React.FC = () => {
  const [orientation, setOrientation] = useState<Orientation>(emptyOrientation);
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      setOrientation({
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      });
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);
  return (
    <div className="sensor-readout">
      <span>β {orientation.beta.toFixed(0)}°</span>
      <span>γ {orientation.gamma.toFixed(0)}°</span>
    </div>
  );
};

async function requestMotionPermission() {
  type PermissionRequester = { requestPermission?: () => Promise<"granted" | "denied"> };
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const orientation = DeviceOrientationEvent as unknown as PermissionRequester;
  const motion = typeof DeviceMotionEvent !== "undefined"
    ? (DeviceMotionEvent as unknown as PermissionRequester)
    : undefined;
  if (typeof orientation.requestPermission === "function") {
    if ((await orientation.requestPermission()) !== "granted") return false;
  }
  if (typeof motion?.requestPermission === "function") {
    if ((await motion.requestPermission()) !== "granted") return false;
  }
  return true;
}

export const GiftVault: React.FC<{ lang?: MotionTrialLang }> = ({ lang = "ru" }) => {
  const [accessWord, setAccessWord] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);
  const [mode, setMode] = useState<RitualMode>("locked");
  const [stageIndex, setStageIndex] = useState(0);
  const [baseline, setBaseline] = useState<Orientation | null>(null);
  const [statusText, setStatusText] = useState("Введите кодовое слово, чтобы начать процедуру.");
  const [giftStates, setGiftStates] = useState<Record<string, GiftState>>(initialGiftState);
  const [pourFill, setPourFill] = useState(0);
  const [pourSpill, setPourSpill] = useState(0);
  const latestOrientation = useRef<Orientation>(emptyOrientation);
  const calibrationTimer = useRef<number | null>(null);
  const pourState = useRef({ fill: 0, spill: 0, completed: false });
  const stage = ritualStages[stageIndex];
  const openedCount = useMemo(
    () => Object.values(giftStates).filter((state) => state.status === "opened").length,
    [giftStates],
  );

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      latestOrientation.current = {
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      };
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      if (calibrationTimer.current) window.clearTimeout(calibrationTimer.current);
    };
  }, []);

  useEffect(() => {
    if (mode !== "pouring" || !baseline || stage.kind !== "pour") return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(80, now - last);
      last = now;
      const angle = Math.max(0, latestOrientation.current.gamma - baseline.gamma);
      const isPouring = angle > 9;
      const tooSteep = angle > 52;
      const state = pourState.current;
      if (isPouring) {
        state.fill = clamp(state.fill + ((angle - 7) / 42) * (dt / 3600), 0, 1.12);
      }
      if (tooSteep) {
        state.spill = clamp(state.spill + ((angle - 52) / 24) * (dt / 950), 0, 1);
      }
      setPourFill(state.fill);
      setPourSpill(state.spill);
      if (state.spill > 0.24 || state.fill > 0.99) {
        setStatusText("Пиала перелита. Верните чахай к тишине и попробуйте снова.");
        setMode("ready");
        return;
      }
      if (state.fill >= 0.84 && state.fill <= 0.91 && angle < 6 && !state.completed) {
        state.completed = true;
        const score = Math.round(100 - Math.abs(state.fill - 0.875) * 220 - state.spill * 110);
        setStatusText("Пиала наполнена ровно. Первая печать поддалась.");
        setMode("complete");
        void completeStage(1, clamp(score, 75, 100));
        return;
      }
      setStatusText(
        state.fill < 0.84
          ? isPouring ? "Настой идет. Держите струю ровной." : "Начните плавный наклон вправо."
          : "Почти достаточно. Верните телефон ровно, чтобы остановить струю.",
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, baseline, stage.kind]);

  const unlockRitual = async () => {
    if (!accessWord.trim()) {
      setStatusText("Введите кодовое слово.");
      return;
    }
    setAccessChecking(true);
    setStatusText("Кладка сверяет слово…");
    try {
      const response = await fetch("/api/fonin-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessWord }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusText(payload?.message ?? "Кодовое слово не принято.");
        return;
      }
      setAccessGranted(true);
      setMode("ready");
      setStatusText(ritualStages[0].intro);
    } catch {
      setStatusText("Не удалось связаться с кладкой. Проверьте сервер и попробуйте снова.");
    } finally {
      setAccessChecking(false);
    }
  };

  const calibratePour = async () => {
    if (!(await requestMotionPermission())) {
      setStatusText("Датчики движения недоступны. Разрешите доступ браузеру и попробуйте снова.");
      return;
    }
    setMode("calibrating");
    setStatusText("Положите телефон на стол и не двигайте 3 секунды.");
    calibrationTimer.current = window.setTimeout(() => {
      const current = latestOrientation.current;
      const unavailable = Math.abs(current.alpha) < 0.01 && Math.abs(current.beta) < 0.01 && Math.abs(current.gamma) < 0.01;
      if (unavailable) {
        setMode("ready");
        setStatusText("Датчики движения не отдают данные. На Samsung проверьте HTTPS, Chrome/Samsung Internet и доступ к датчикам.");
        return;
      }
      setBaseline(current);
      setMode("ready");
      setStatusText("Нулевое положение считано. Можно начинать испытание.");
    }, 3000);
  };

  const startPour = () => {
    if (!baseline) {
      setStatusText("Сначала положите телефон на стол и считайте нулевое положение.");
      return;
    }
    pourState.current = { fill: 0, spill: 0, completed: false };
    setPourFill(0);
    setPourSpill(0);
    setMode("pouring");
    setStatusText("Плавно наклоните вправо. Когда пиала почти наполнится — верните телефон ровно.");
  };

  const completeStage = async (stageNumber: number, score: number) => {
    const completedStage = ritualStages[stageNumber - 1];
    setGiftStates((previous) => ({
      ...previous,
      [completedStage.giftId]: { ...previous[completedStage.giftId], status: "opening" },
    }));
    try {
      const response = await fetch("/api/fonin-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId: completedStage.giftId,
          accessWord,
          ritual: { stage: stageNumber, score },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = payload?.message ?? "Печать не открылась.";
        setGiftStates((previous) => ({
          ...previous,
          [completedStage.giftId]: { ...previous[completedStage.giftId], status: "error", message },
        }));
        setStatusText(message);
        if (completedStage.kind === "pour") setMode("ready");
        return false;
      }
      setGiftStates((previous) => ({
        ...previous,
        [completedStage.giftId]: {
          status: "opened",
          opened: { certificate: payload.certificate, note: payload.note },
        },
      }));
      return true;
    } catch {
      const message = "Связь с хранилищем прервалась. Попробуйте еще раз.";
      setGiftStates((previous) => ({
        ...previous,
        [completedStage.giftId]: { ...previous[completedStage.giftId], status: "error", message },
      }));
      setStatusText(message);
      if (completedStage.kind === "pour") setMode("ready");
      return false;
    }
  };

  const retryPour = () => {
    if (calibrationTimer.current) window.clearTimeout(calibrationTimer.current);
    calibrationTimer.current = null;
    setBaseline(null);
    setPourFill(0);
    setPourSpill(0);
    setMode("ready");
    setStatusText(stage.intro);
  };

  const goNextStage = () => {
    const nextStage = stageIndex + 1;
    if (nextStage >= ritualStages.length) {
      setStatusText("Все печати раскрыты. Процедура завершена.");
      return;
    }
    setStageIndex(nextStage);
    setBaseline(null);
    setPourFill(0);
    setPourSpill(0);
    setMode("ready");
    setStatusText(ritualStages[nextStage].intro);
  };

  const renderPourVisual = () => (
    <div className="pour-visual" aria-hidden="true">
      <div className="fair-cup" style={{ transform: `rotate(${pourFill > 0 ? 26 : 0}deg)` }} />
      <div className="pour-stream" style={{ opacity: mode === "pouring" && pourFill < 0.98 ? clamp(pourFill + 0.15, 0, 1) : 0 }} />
      <div className={`tea-cup ${pourSpill > 0.18 ? "tea-cup--danger" : ""}`}>
        <span style={{ transform: `scaleY(${clamp(pourFill, 0.04, 1)})` }} />
      </div>
      <div className="spill-meter"><span style={{ transform: `scaleX(${pourSpill})` }} /></div>
    </div>
  );

  return (
    <section className="gift-vault" aria-label="Три запечатанных дара Дмитрия Фонина">
      <div className="vault-header">
        <p className="vault-kicker">Три испытания формы</p>
        <h1>Запечатанная кладка Дмитрия Фонина</h1>
        <p>Печати открываются не ответами, а движением: ровный пролив, ловля формы и желтковый оракул.</p>
        <span className="vault-progress">Открыто {openedCount} / {gifts.length}</span>
      </div>

      <div className="ritual-panel">
        {!accessGranted ? (
          <div className="ritual-lock">
            <h2>Код Основателя</h2>
            <p>Перед процедурой кладка просит короткое слово.</p>
            <input
              className="gift-answer"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={accessWord}
              onChange={(event) => setAccessWord(event.target.value)}
              disabled={accessChecking}
              onKeyDown={(event) => { if (event.key === "Enter") void unlockRitual(); }}
            />
            <button className="gift-open-btn" type="button" disabled={accessChecking} onClick={() => void unlockRitual()}>
              {accessChecking ? "Сверяю…" : "Принять слово"}
            </button>
            <p className="gift-message" role="status">{statusText}</p>
          </div>
        ) : stage.kind === "pour" ? (
          <div className="ritual-stage">
            <p className="vault-kicker">Этап {stageIndex + 1} / {ritualStages.length}</p>
            <h2>{stage.title}</h2>
            <p>{statusText}</p>
            {renderPourVisual()}
            <SensorReadout />
            <div className="ritual-actions">
              {!baseline ? (
                <button className="gift-open-btn" type="button" onClick={() => void calibratePour()} disabled={mode === "calibrating"}>
                  {mode === "calibrating" ? "Считываю стол…" : "Положить на стол"}
                </button>
              ) : null}
              <button className="gift-open-btn" type="button" onClick={startPour} disabled={mode === "calibrating" || mode === "pouring"}>
                Начать испытание
              </button>
              {mode === "ready" ? (
                <button className="gift-open-btn gift-open-btn--ghost" type="button" onClick={retryPour}>Сбросить этап</button>
              ) : null}
              {giftStates[stage.giftId]?.status === "opened" ? (
                <button className="gift-open-btn" type="button" onClick={goNextStage}>Следующая печать</button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="ritual-stage">
            <p className="vault-kicker">Этап {stageIndex + 1} / {ritualStages.length}</p>
            <MotionTrial
              key={stage.kind}
              kind={stage.kind}
              lang={lang}
              context="fonin"
              onComplete={({ score }) => completeStage(stageIndex + 1, score)}
            />
            {giftStates[stage.giftId]?.status === "opened" && stageIndex < ritualStages.length - 1 ? (
              <button className="gift-open-btn" type="button" onClick={goNextStage}>Следующая печать</button>
            ) : null}
          </div>
        )}
      </div>

      <div className="gift-grid">
        {gifts.map((gift) => {
          const state = giftStates[gift.id];
          const opened = state.status === "opened";
          const certificate = state.opened?.certificate;
          const certificateIsLink = certificate?.startsWith("http") || certificate?.startsWith("/api/");
          return (
            <article className={`gift-card ${opened ? "gift-card--opened" : ""}`} key={gift.id}>
              <div className="gift-card-inner">
                <div className="gift-card-face gift-card-front" aria-hidden={opened}>
                  <span className="gift-number">{gift.number}</span>
                  <h2>{gift.title}</h2>
                  <p className="gift-shop">Содержимое скрыто до раскрытия</p>
                  <p className="gift-question">Печать откроется после своего испытания.</p>
                  {state.message ? <p className="gift-message" role="status">{state.message}</p> : null}
                </div>
                <div className="gift-card-face gift-card-back" aria-hidden={!opened}>
                  <span className="gift-number">{gift.number}</span>
                  <p className="gift-unlocked">Печать раскрыта</p>
                  <h2>{gift.shop}</h2>
                  <p className="gift-certificate">{certificateIsLink ? "Кодекс раскрыт." : certificate}</p>
                  {certificateIsLink ? (
                    <a className="gift-open-btn" href={certificate} target="_blank" rel="noopener noreferrer">Открыть</a>
                  ) : null}
                  {state.opened?.note ? <p className="gift-note">{state.opened.note}</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
