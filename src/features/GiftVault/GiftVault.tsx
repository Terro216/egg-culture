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

const EN: Record<string, string> = {
  "Первая печать": "The first seal",
  "Чайный дом №1": "Tea House No. 1",
  "Вторая печать": "The second seal",
  "Чайный дом №2": "Tea House No. 2",
  "Третья печать": "The third seal",
  "Дело чайного гномика": "The Tea Gnome’s Business",
  "Чахай и пиала": "Fairness pitcher and teacup",
  "Плавно поверните телефон, будто переливаете настой из чахая в пиалу. Главное — не перелить.": "Gently tilt your phone as if pouring tea from a fairness pitcher into a cup. Take care not to overfill it.",
  "Халаза-тест": "The Chalaza Test",
  "Удержите яйцо в центре. Даже идеальная неподвижность не спасает: форма начнет укатываться, ее придется ловить наклоном.": "Keep the egg in the centre. Stillness alone will not help: the form begins to roll, and you must catch it by tilting.",
  "Оракул желтка": "Oracle of the Yolk",
  "Сформулируйте вопрос. Оракулу нужны три точных встряхивания.": "Formulate your question. The Oracle requires three precise shakes.",
  "Введите кодовое слово, чтобы начать процедуру.": "Enter the code word to begin.",
  "Пиала перелита. Верните чахай к тишине и попробуйте снова.": "The cup overflowed. Return the pitcher to stillness and try again.",
  "Пиала наполнена ровно. Первая печать поддалась.": "The cup is evenly filled. The first seal has yielded.",
  "Настой идет. Держите струю ровной.": "The tea is flowing. Keep the stream steady.",
  "Начните плавный наклон вправо.": "Begin a gentle tilt to the right.",
  "Почти достаточно. Верните телефон ровно, чтобы остановить струю.": "Almost enough. Return your phone to level to stop pouring.",
  "Введите кодовое слово.": "Enter the code word.",
  "Кладка сверяет слово…": "The Clutch is checking the word…",
  "Кодовое слово не принято.": "The code word was not accepted.",
  "Не удалось связаться с кладкой. Проверьте соединение и попробуйте снова.": "The Clutch could not be reached. Please try again.",
  "Датчики движения недоступны. Разрешите доступ браузеру и попробуйте снова.": "Motion sensors are unavailable. Allow browser access and try again.",
  "Положите телефон на стол и не двигайте 3 секунды.": "Place your phone on a table and keep it still for 3 seconds.",
  "Не удалось получить показания движения. Разрешите доступ к датчикам или выберите ручное управление.": "No motion data was received. Allow sensor access or choose manual controls.",
  "Нулевое положение считано. Можно начинать испытание.": "The neutral position has been recorded. You can begin the trial.",
  "Сначала положите телефон на стол и считайте нулевое положение.": "First place the phone on a table and record its neutral position.",
  "Плавно наклоните вправо. Когда пиала почти наполнится — верните телефон ровно.": "Tilt gently to the right. When the cup is almost full, bring the phone back to level.",
  "Печать не открылась.": "The seal did not open.",
  "Связь с хранилищем прервалась. Попробуйте еще раз.": "The connection to the vault was interrupted. Please try again.",
  "Все печати раскрыты. Процедура завершена.": "All seals are open. The procedure is complete.",
  "Три запечатанных дара Дмитрия Фонина": "Three sealed gifts from Dmitry Fonin",
  "Три испытания формы": "Three trials of form",
  "Запечатанная кладка Дмитрия Фонина": "Dmitry Fonin’s sealed clutch",
  "Печати открываются не ответами, а движением: ровный пролив, ловля формы и желтковый оракул.": "The seals open through movement: a steady pour, the capture of form and the yolk oracle.",
  "Код Основателя": "The Founder’s code",
  "Перед процедурой кладка просит короткое слово.": "Before the procedure, the Clutch asks for a short word.",
  "Сверяю…": "Checking…",
  "Принять слово": "Submit the word",
  "Считываю стол…": "Reading the table…",
  "Положить на стол": "Place on the table",
  "Сбросить этап": "Reset stage",
  "Следующая печать": "Next seal",
  "Начать испытание": "Begin the trial",
  "Содержимое скрыто до раскрытия": "Contents hidden until the seal is opened",
  "Печать откроется после своего испытания.": "The seal opens after its trial.",
  "Печать раскрыта": "The seal is open",
  "Кодекс раскрыт.": "The codex is open.",
  "Открыть": "Open",
  "Управление наклоном": "Tilt controls",
  "Датчики телефона": "Phone sensors",
  "Ручное управление": "Manual controls",
  "Наклон чахая": "Pitcher tilt",
  "Наклоняйте чахай ползунком или стрелками клавиатуры. Чтобы остановить струю, верните наклон к нулю.": "Tilt the pitcher with the slider or keyboard arrows. Return the tilt to zero to stop the stream.",
  "Почти достаточно. Верните наклон к нулю, чтобы остановить струю.": "Almost enough. Return the tilt to zero to stop the stream."
};

export const GiftVault: React.FC<{ lang?: MotionTrialLang }> = ({ lang = "ru" }) => {
  const t = (value: string) => lang === "ru" ? value : EN[value] ?? value;
  const [accessWord, setAccessWord] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);
  const [mode, setMode] = useState<RitualMode>("locked");
  const [stageIndex, setStageIndex] = useState(0);
  const [baseline, setBaseline] = useState<Orientation | null>(null);
  const [statusText, setStatusText] = useState(t("Введите кодовое слово, чтобы начать процедуру."));
  const [giftStates, setGiftStates] = useState<Record<string, GiftState>>(initialGiftState);
  const [pourFill, setPourFill] = useState(0);
  const [pourSpill, setPourSpill] = useState(0);
  const [controlMode, setControlMode] = useState<"sensor" | "manual">("sensor");
  const [manualAngle, setManualAngle] = useState(0);
  const manualTilt = useRef(0);
  const latestOrientation = useRef<Orientation>(emptyOrientation);
  const orientationReceived = useRef(false);
  const calibrationTimer = useRef<number | null>(null);
  const pourState = useRef({ fill: 0, spill: 0, completed: false });
  const stage = ritualStages[stageIndex];
  const openedCount = useMemo(
    () => Object.values(giftStates).filter((state) => state.status === "opened").length,
    [giftStates],
  );

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta !== null && event.gamma !== null && Number.isFinite(event.beta) && Number.isFinite(event.gamma)) orientationReceived.current = true;
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
      const angle = controlMode === "manual" ? manualTilt.current : Math.max(0, latestOrientation.current.gamma - baseline.gamma);
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
        setStatusText(t("Пиала перелита. Верните чахай к тишине и попробуйте снова."));
        setMode("ready");
        return;
      }
      if (state.fill >= 0.84 && state.fill <= 0.91 && angle < 6 && !state.completed) {
        state.completed = true;
        const score = Math.round(100 - Math.abs(state.fill - 0.875) * 220 - state.spill * 110);
        setStatusText(t("Пиала наполнена ровно. Первая печать поддалась."));
        setMode("complete");
        void completeStage(1, clamp(score, 75, 100));
        return;
      }
      setStatusText(
        state.fill < 0.84
          ? isPouring ? t("Настой идет. Держите струю ровной.") : t("Начните плавный наклон вправо.")
          : controlMode === "manual" ? t("Почти достаточно. Верните наклон к нулю, чтобы остановить струю.") : t("Почти достаточно. Верните телефон ровно, чтобы остановить струю."),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, baseline, stage.kind, controlMode]);

  const unlockRitual = async () => {
    if (!accessWord.trim()) {
      setStatusText(t("Введите кодовое слово."));
      return;
    }
    setAccessChecking(true);
    setStatusText(t("Кладка сверяет слово…"));
    try {
      const response = await fetch("/api/fonin-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessWord }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatusText(lang === "ru" && payload?.message ? payload.message : t("Кодовое слово не принято."));
        return;
      }
      setAccessGranted(true);
      setMode("ready");
      setStatusText(t(ritualStages[0].intro));
    } catch {
      setStatusText(t("Не удалось связаться с кладкой. Проверьте соединение и попробуйте снова."));
    } finally {
      setAccessChecking(false);
    }
  };

  const calibratePour = async () => {
    if (!(await requestMotionPermission().catch(() => false))) {
      setStatusText(t("Датчики движения недоступны. Разрешите доступ браузеру и попробуйте снова."));
      return;
    }
    setMode("calibrating");
    setStatusText(t("Положите телефон на стол и не двигайте 3 секунды."));
    calibrationTimer.current = window.setTimeout(() => {
      const current = latestOrientation.current;
      const unavailable = !orientationReceived.current;
      if (unavailable) {
        setMode("ready");
        setStatusText(t("Не удалось получить показания движения. Разрешите доступ к датчикам или выберите ручное управление."));
        return;
      }
      setBaseline(current);
      setMode("ready");
      setStatusText(t("Нулевое положение считано. Можно начинать испытание."));
    }, 3000);
  };

  const startPour = () => {
    if (!baseline) {
      setStatusText(t("Сначала положите телефон на стол и считайте нулевое положение."));
      return;
    }
    pourState.current = { fill: 0, spill: 0, completed: false };
    setPourFill(0);
    setPourSpill(0);
    setMode("pouring");
    setStatusText(controlMode === "manual" ? t("Наклоняйте чахай ползунком или стрелками клавиатуры. Чтобы остановить струю, верните наклон к нулю.") : t("Плавно наклоните вправо. Когда пиала почти наполнится — верните телефон ровно."));
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
        const message = lang === "ru" && payload?.message ? payload.message : t("Печать не открылась.");
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
      const message = t("Связь с хранилищем прервалась. Попробуйте еще раз.");
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
    setBaseline(controlMode === "manual" ? emptyOrientation : null);
    manualTilt.current = 0; setManualAngle(0);
    setPourFill(0);
    setPourSpill(0);
    setMode("ready");
    setStatusText(controlMode === "manual" ? t("Наклоняйте чахай ползунком или стрелками клавиатуры. Чтобы остановить струю, верните наклон к нулю.") : t(stage.intro));
  };

  const goNextStage = () => {
    const nextStage = stageIndex + 1;
    if (nextStage >= ritualStages.length) {
      setStatusText(t("Все печати раскрыты. Процедура завершена."));
      return;
    }
    setStageIndex(nextStage);
    setBaseline(null);
    setPourFill(0);
    setPourSpill(0);
    setMode("ready");
    setStatusText(t(ritualStages[nextStage].intro));
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
    <section className="gift-vault" aria-label={t("Три запечатанных дара Дмитрия Фонина")}>
      <div className="vault-header">
        <p className="vault-kicker">{t("Три испытания формы")}</p>
        <h1>{t("Запечатанная кладка Дмитрия Фонина")}</h1>
        <p>{t("Печати открываются не ответами, а движением: ровный пролив, ловля формы и желтковый оракул.")}</p>
        <span className="vault-progress">{lang === "ru" ? "Открыто" : "Opened"} {openedCount} / {gifts.length}</span>
      </div>

      <div className="ritual-panel">
        {!accessGranted ? (
          <div className="ritual-lock">
            <h2>{t("Код Основателя")}</h2>
            <p>{t("Перед процедурой кладка просит короткое слово.")}</p>
            <input
              className="gift-answer"
              type="text"
              inputMode="text"
              autoComplete="off"
              aria-label={t("Код Основателя")}
              value={accessWord}
              onChange={(event) => setAccessWord(event.target.value)}
              disabled={accessChecking}
              onKeyDown={(event) => { if (event.key === "Enter") void unlockRitual(); }}
            />
            <button className="gift-open-btn" type="button" disabled={accessChecking} onClick={() => void unlockRitual()}>
              {accessChecking ? t("Сверяю…") : t("Принять слово")}
            </button>
            <p className="gift-message" role="status">{statusText}</p>
          </div>
        ) : stage.kind === "pour" ? (
          <div className="ritual-stage">
            <p className="vault-kicker">{lang === "ru" ? "Этап" : "Stage"} {stageIndex + 1} / {ritualStages.length}</p>
            <h2>{t(stage.title)}</h2>
            <p>{statusText}</p>
            <div className="ritual-actions" role="group" aria-label={t("Управление наклоном")}>
              <button type="button" className="gift-open-btn gift-open-btn--ghost" aria-pressed={controlMode === "sensor"} disabled={mode === "pouring" || mode === "calibrating"} onClick={() => { setControlMode("sensor"); setBaseline(null); setMode("ready"); setStatusText(t(stage.intro)); }}>{t("Датчики телефона")}</button>
              <button type="button" className="gift-open-btn gift-open-btn--ghost" aria-pressed={controlMode === "manual"} disabled={mode === "pouring" || mode === "calibrating"} onClick={() => { setControlMode("manual"); setBaseline(emptyOrientation); manualTilt.current = 0; setManualAngle(0); setMode("ready"); setStatusText(t("Наклоняйте чахай ползунком или стрелками клавиатуры. Чтобы остановить струю, верните наклон к нулю.")); }}>{t("Ручное управление")}</button>
            </div>
            {renderPourVisual()}
            {controlMode === "sensor" ? <SensorReadout /> : <label className="manual-pour-control" style={{ display: "grid", gap: "12px", width: "100%", maxWidth: "440px", margin: "16px auto" }}>
              <span>{t("Наклон чахая")}: <output>{manualAngle}°</output></span>
              <input type="range" min={0} max={70} step={1} value={manualAngle} onChange={event => { const angle = Number(event.target.value); manualTilt.current = angle; setManualAngle(angle); }} aria-label={t("Наклон чахая")} style={{ width: "100%", minHeight: "44px", accentColor: "#ffd48a" }} />
            </label>}
            <div className="ritual-actions">
              {controlMode === "sensor" && !baseline ? (
                <button className="gift-open-btn" type="button" onClick={() => void calibratePour()} disabled={mode === "calibrating"}>
                  {mode === "calibrating" ? t("Считываю стол…") : t("Положить на стол")}
                </button>
              ) : null}
              <button className="gift-open-btn" type="button" onClick={startPour} disabled={mode === "calibrating" || mode === "pouring"}>
                {t("Начать испытание")}
              </button>
              {mode === "ready" ? (
                <button className="gift-open-btn gift-open-btn--ghost" type="button" onClick={retryPour}>{t("Сбросить этап")}</button>
              ) : null}
              {giftStates[stage.giftId]?.status === "opened" ? (
                <button className="gift-open-btn" type="button" onClick={goNextStage}>{t("Следующая печать")}</button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="ritual-stage">
            <p className="vault-kicker">{lang === "ru" ? "Этап" : "Stage"} {stageIndex + 1} / {ritualStages.length}</p>
            <MotionTrial
              key={stage.kind}
              kind={stage.kind}
              lang={lang}
              context="fonin"
              onComplete={({ score }) => completeStage(stageIndex + 1, score)}
            />
            {giftStates[stage.giftId]?.status === "opened" && stageIndex < ritualStages.length - 1 ? (
              <button className="gift-open-btn" type="button" onClick={goNextStage}>{t("Следующая печать")}</button>
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
                  <h2>{t(gift.title)}</h2>
                  <p className="gift-shop">{t("Содержимое скрыто до раскрытия")}</p>
                  <p className="gift-question">{t("Печать откроется после своего испытания.")}</p>
                  {state.message ? <p className="gift-message" role="status">{state.message}</p> : null}
                </div>
                <div className="gift-card-face gift-card-back" aria-hidden={!opened}>
                  <span className="gift-number">{gift.number}</span>
                  <p className="gift-unlocked">{t("Печать раскрыта")}</p>
                  <h2>{t(gift.shop)}</h2>
                  <p className="gift-certificate">{certificateIsLink ? t("Кодекс раскрыт.") : certificate}</p>
                  {certificateIsLink ? (
                    <a className="gift-open-btn" href={certificate} target="_blank" rel="noopener noreferrer">{t("Открыть")}</a>
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
