import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import "./MotionTrial.css";

export type MotionTrialKind = "chalaza" | "oracle";
export type MotionTrialLang = "ru" | "en";

export type MotionTrialResult = {
  kind: MotionTrialKind;
  score: number;
  prediction?: string;
};

type MotionTrialProps = {
  kind: MotionTrialKind;
  lang: MotionTrialLang;
  context?: "adept" | "fonin";
  onComplete?: (
    result: MotionTrialResult,
  ) => boolean | void | Promise<boolean | void>;
};

type TrialMode = "ready" | "calibrating" | "playing" | "complete";
type Orientation = { alpha: number; beta: number; gamma: number };
type Vector2 = { x: number; y: number };

const emptyOrientation: Orientation = { alpha: 0, beta: 0, gamma: 0 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distanceFromCenter = (point: Vector2) => Math.hypot(point.x, point.y);

const CHALAZA_CENTER_RADIUS = 0.32;
const CHALAZA_FRAME_LIMIT = 1.08;
const CHALAZA_HOLD_MS = 5200;
const CHALAZA_VISUAL_EGG_WIDTH_RATIO = 0.46;
const CHALAZA_VISUAL_EGG_HEIGHT_RATIO = 0.68;
const CHALAZA_CONTROL_DIVISOR = 40;
const CHALAZA_CONTROL_FORCE = 0.56;
const CHALAZA_DAMPING = 0.91;
const CHALAZA_POSITION_STEP_MS = 20.6;
const CHALAZA_MANUAL_SPEED = 0.04;
const CHALAZA_MANUAL_DRIFT = 0.04;
const CHALAZA_MANUAL_RESPONSE = 0.32;
const ORACLE_SHAKE_ACTIVE_MAGNITUDE = 13;
const ORACLE_SHAKE_START_MAGNITUDE = 16;
const ORACLE_SUCCESS_MIN_MAGNITUDE = 24;
const ORACLE_SUCCESS_MAX_MAGNITUDE = 30;
const ORACLE_SHAKE_RELEASE_MS = 180;
const ORACLE_REQUIRED_SHAKES = 3;
const ORACLE_TIMEOUT_MS = 9000;
const ORACLE_VIBRATION_INTERVAL_MS = 110;
const ORACLE_MANUAL_TOO_FAST_MS = 650;
const ORACLE_MANUAL_TOO_SLOW_MS = 2200;
const ORACLE_MANUAL_IDEAL_MS = 1200;

type VibrationPattern = number | number[];
type VibratingNavigator = Navigator & {
  webkitVibrate?: (pattern: VibrationPattern) => boolean;
};

const vibrate = (pattern: VibrationPattern) => {
  if (typeof window === "undefined") return false;
  const vibratingNavigator = window.navigator as VibratingNavigator;
  const vibration = (vibratingNavigator.vibrate ??
    vibratingNavigator.webkitVibrate) as
    | ((pattern: VibrationPattern) => boolean)
    | undefined;
  return vibration?.call(vibratingNavigator, pattern) ?? false;
};

const copy = {
  ru: {
    chalaza: {
      kicker: "Испытание формы",
      title: "Халаза-тест",
      intro:
        "Удержите яйцо в центре. Даже идеальная неподвижность не спасает: форму придётся ловить наклоном.",
      calibrate: "Положить на стол",
      calibrating: "Считываю стол…",
      calibrationStatus: "Положите телефон на стол и не двигайте 3 секунды.",
      calibrated: "Нулевое положение считано. Можно начинать испытание.",
      start: "Начать испытание",
      playing: "Яйцо начинает уходить. Ловите центр наклоном телефона.",
      centered: "Центр пойман. Удерживайте.",
      drifting: "Яйцо уходит. Ловите наклоном телефона.",
      rolledAway: "Яйцо укатилось за край блюда.",
      retryAfterRoll: "Попробуйте снова. У нас ещё много больших яиц.",
      success: "Халаза удержала форму. Испытание пройдено.",
      foninSuccess: "Халаза удержала форму. Вторая печать поддалась.",
      close: "Закрыть испытание",
      reset: "Начать заново",
      manual: "Играть без датчиков",
      manualStatus:
        "Управляйте формой стрелками, клавишами или касанием арены.",
      sensorUnavailable:
        "Датчики движения не отдают данные. Проверьте HTTPS и доступ к датчикам или выберите управление без датчиков.",
    },
    oracle: {
      kicker: "Испытание восприятия",
      title: "Оракул желтка",
      intro:
        "Сформулируйте вопрос. Оракул отвечает после трёх точных встряхиваний.",
      ask: "Спросить оракула",
      playing:
        "Три точных встряхивания. Слабый импульс не будет прочитан, чрезмерный разрушит Купол.",
      firstShake: "Первый импульс принят. Осталось два встряхивания.",
      secondShake: "Второй импульс принят. Осталось одно встряхивание.",
      silent: "Вопрос не достиг желтка.",
      tooQuiet: "Импульс слишком слабый. Повторите вопрос точнее.",
      broken: "Слишком быстрый импульс разрушил Купол.",
      tooStrong: "Купол треснул. Сбавьте темп и повторите вопрос.",
      success: "Ответ Оракула сформирован.",
      foninSuccess: "Ответ Оракула сформирован. Третья печать поддалась.",
      idle: "Оракул ожидает вопрос.",
      result: "Ответ Оракула",
      reset: "Спросить ещё раз",
      manual: "Спросить без датчиков",
      manualStatus:
        "Трижды коснитесь желтка: не торопясь, но без долгой паузы.",
      sensorUnavailable:
        "Датчики движения недоступны. Разрешите доступ браузеру или выберите испытание без датчиков.",
    },
    common: {
      completionError: "Испытание пройдено, но результат не удалось сохранить.",
      permissionDenied:
        "Браузер не дал доступ к датчикам. Можно пройти испытание без них.",
      sensorLabel: "Показания датчиков",
      manualLabel: "Ручное управление",
    },
  },
  en: {
    chalaza: {
      kicker: "Trial of form",
      title: "The Chalaza Test",
      intro:
        "Keep the egg at the centre. Perfect stillness will not save it: catch the form by tilting your phone.",
      calibrate: "Place on the table",
      calibrating: "Reading the table…",
      calibrationStatus: "Place the phone on a table and keep it still for 3 seconds.",
      calibrated: "The neutral position is set. The trial may begin.",
      start: "Begin the trial",
      playing: "The egg is drifting. Catch the centre by tilting your phone.",
      centered: "The centre is held. Keep it there.",
      drifting: "The egg is drifting. Catch it with the tilt of your phone.",
      rolledAway: "The egg rolled beyond the edge of the dish.",
      retryAfterRoll: "Try again. We still have plenty of large eggs.",
      success: "The chalaza held the form. The trial is complete.",
      foninSuccess: "The chalaza held the form. The second seal yielded.",
      close: "Close the trial",
      reset: "Begin again",
      manual: "Play without sensors",
      manualStatus:
        "Guide the form with the arrows, keyboard, or by touching the arena.",
      sensorUnavailable:
        "The motion sensors returned no data. Check HTTPS and sensor access, or use the sensor-free controls.",
    },
    oracle: {
      kicker: "Trial of perception",
      title: "Oracle of the Yolk",
      intro:
        "Formulate a question. The Oracle answers after three precise shakes.",
      ask: "Ask the oracle",
      playing:
        "Three precise shakes. A weak impulse will not be read; an excessive one will break the Dome.",
      firstShake: "The first impulse is received. Two shakes remain.",
      secondShake: "The second impulse is received. One shake remains.",
      silent: "The question did not reach the yolk.",
      tooQuiet: "The impulse was too weak. Ask the question more precisely.",
      broken: "An overly rapid impulse broke the Dome.",
      tooStrong: "The Dome cracked. Slow down and ask again.",
      success: "The Oracle's answer is formed.",
      foninSuccess: "The Oracle's answer is formed. The third seal yielded.",
      idle: "The Oracle awaits a question.",
      result: "The Oracle's answer",
      reset: "Ask again",
      manual: "Ask without sensors",
      manualStatus:
        "Touch the yolk three times: without haste, but without a long pause.",
      sensorUnavailable:
        "Motion sensors are unavailable. Allow browser access or use the sensor-free trial.",
    },
    common: {
      completionError: "The trial is complete, but its result could not be saved.",
      permissionDenied:
        "The browser denied sensor access. You can complete the trial without sensors.",
      sensorLabel: "Sensor readings",
      manualLabel: "Manual controls",
    },
  },
} as const;

// Every capitalised term here is defined in the Adept's Guide.
const oraclePredictions: Record<MotionTrialLang, string[]> = {
  ru: [
    "Ответ собранный. Сохраняйте выбранный курс.",
    "Сейчас говорит Пустота. Не принимайте отсутствие сопротивления за согласие.",
    "Нужна Температурная Пауза. Вернитесь к вопросу, когда он достигнет комнатной температуры.",
    "Первая Атака резкая, но Развитие обещает мягкий Финиш.",
    "Вертикаль ясна. Выбирайте решение, после которого выпрямляется осанка.",
    "Заземление сильнее импульса. Сегодня лучше остаться.",
    "Меловой след чистый. Источник заслуживает доверия.",
    "Халаза натянута: центр удержится, если не ускорять движение.",
    "Купол высокий и упругий. Решение выдержит вскрытие.",
    "Индустриальный Стрим предлагает предсказуемость. Если нужна глубина, ищите другой терруар.",
    "Дворовый Дикий: исход непредсказуем, но Яй Ци живое.",
    "Архивный Стиль: решение созрело; дальнейшая выдержка даст только сернистость.",
    "Светлый Стиль: уберите лишнее. Ответ останется.",
    "Бульонный Стиль: решение тяжёлое, но даёт Заземление.",
    "Пасторальный Стиль: мягкость здесь не равна Пустоте.",
    "Это нервная партия. Не фиксируйте вывод по одной Атаке.",
  ],
  en: [
    "The answer is Composed. Hold your chosen course.",
    "The Void is speaking. Do not mistake the absence of resistance for consent.",
    "A Temperature Pause is required. Return when the question reaches room temperature.",
    "The first Attack is sharp, but Development promises a gentle Finish.",
    "Verticality is clear. Choose the decision that straightens your posture.",
    "Grounding outweighs impulse. Today, remain where you are.",
    "The Chalky Trail is clean. The source deserves trust.",
    "The chalaza is taut: the centre will hold if you do not accelerate.",
    "The Dome is high and resilient. The decision will survive opening.",
    "The Industrial Stream offers predictability. If you need depth, seek another terroir.",
    "Yard Wild: the outcome is unpredictable, but its Egg Qi is alive.",
    "The Aged Style: the decision has matured; more time will add only sulfur.",
    "The Blanc Style: remove what is unnecessary. The answer will remain.",
    "The Bouillon Style: the decision is heavy, but it brings Grounding.",
    "The Pastoral Style: softness here is not the Void.",
    "This batch is Nervous. Do not settle the question after one Attack.",
  ],
};

const SensorReadout: React.FC<{
  orientation: Orientation;
  label: string;
}> = ({ orientation, label }) => (
  <div className="motion-sensor-readout" aria-label={label}>
    <span>β {orientation.beta.toFixed(0)}°</span>
    <span>γ {orientation.gamma.toFixed(0)}°</span>
  </div>
);

const MonumentalEggModel: React.FC<{ offset: Vector2 }> = ({ offset }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 12;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(180, 180);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const y = positions.getY(i);
      const scale = 1 - y * 0.12;
      positions.setX(i, positions.getX(i) * scale);
      positions.setZ(i, positions.getZ(i) * scale);
      positions.setY(i, y * 1.55);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    });
    const egg = new THREE.Mesh(geometry, material);
    scene.add(egg);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const mainLight = new THREE.DirectionalLight(0xffffff, 2);
    mainLight.position.set(5, 10, 7);
    scene.add(mainLight);
    const goldLight = new THREE.PointLight(0xd4af37, 100, 50);
    goldLight.position.set(-5, -3, -5);
    scene.add(goldLight);

    let animationFrame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      egg.rotation.y = elapsedTime * 0.45;
      egg.rotation.z = 0.15 + offsetRef.current.x * 0.0012;
      egg.rotation.x = 0.1 - offsetRef.current.y * 0.001;
      egg.position.y = Math.sin(elapsedTime * 0.9) * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, []);

  return (
    <div
      className="motion-chalaza-egg"
      ref={containerRef}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.08}deg)`,
      }}
    />
  );
};

async function requestMotionPermission() {
  type PermissionRequester = {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (
    typeof DeviceOrientationEvent === "undefined" &&
    typeof DeviceMotionEvent === "undefined"
  ) {
    return false;
  }
  const orientation =
    typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as PermissionRequester)
      : undefined;
  const motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as PermissionRequester)
      : undefined;

  if (typeof orientation?.requestPermission === "function") {
    if ((await orientation.requestPermission()) !== "granted") return false;
  }
  if (typeof motion?.requestPermission === "function") {
    if ((await motion.requestPermission()) !== "granted") return false;
  }
  return true;
}

export const MotionTrial: React.FC<MotionTrialProps> = ({
  kind,
  lang,
  context = "adept",
  onComplete,
}) => {
  const ui = copy[lang];
  const trialCopy = ui[kind];
  const [mode, setMode] = useState<TrialMode>("ready");
  const [status, setStatus] = useState<string>(trialCopy.intro);
  const [orientation, setOrientation] = useState<Orientation>(emptyOrientation);
  const [baseline, setBaseline] = useState<Orientation | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [eggOffset, setEggOffset] = useState<Vector2>({ x: 0, y: 0 });
  const [chalazaHoldMs, setChalazaHoldMs] = useState(0);
  const [chalazaRolledAway, setChalazaRolledAway] = useState(false);
  const [shakePower, setShakePower] = useState(0);
  const [oracleAnswer, setOracleAnswer] = useState(
    kind === "oracle" ? ui.oracle.idle : "",
  );
  const [oracleBroken, setOracleBroken] = useState(false);

  const latestOrientation = useRef<Orientation>(emptyOrientation);
  const modeRef = useRef<TrialMode>("ready");
  const manualModeRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const arenaSize = useRef({
    width: 320,
    height: 420,
    eggWidth: 180,
    eggHeight: 180,
  });
  const calibrationTimer = useRef<number | null>(null);
  const rollTimer = useRef<number | null>(null);
  const oracleSettleTimer = useRef<number | null>(null);
  const oracleTimeoutTimer = useRef<number | null>(null);
  const oracleShakeInProgress = useRef(false);
  const oracleShakeCount = useRef(0);
  const oracleShakePeaks = useRef<number[]>([]);
  const oracleResolved = useRef(false);
  const shakePeak = useRef(0);
  const oracleLastVibration = useRef(0);
  const manualTaps = useRef<number[]>([]);
  const manualControl = useRef<Vector2>({ x: 0, y: 0 });
  const chalazaState = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    holdMs: 0,
    completed: false,
  });

  const fullscreenActive =
    kind === "chalaza" &&
    mode !== "complete" &&
    (mode === "calibrating" || mode === "playing" || Boolean(baseline));

  const clearTimers = () => {
    if (calibrationTimer.current) window.clearTimeout(calibrationTimer.current);
    if (rollTimer.current) window.clearTimeout(rollTimer.current);
    if (oracleSettleTimer.current)
      window.clearTimeout(oracleSettleTimer.current);
    if (oracleTimeoutTimer.current)
      window.clearTimeout(oracleTimeoutTimer.current);
    calibrationTimer.current = null;
    rollTimer.current = null;
    oracleSettleTimer.current = null;
    oracleTimeoutTimer.current = null;
  };

  const resetOracle = () => {
    oracleShakeInProgress.current = false;
    oracleShakeCount.current = 0;
    oracleShakePeaks.current = [];
    oracleResolved.current = false;
    shakePeak.current = 0;
    oracleLastVibration.current = 0;
    manualTaps.current = [];
    setShakePower(0);
    setOracleBroken(false);
    setOracleAnswer(ui.oracle.idle);
    vibrate(0);
  };

  const reset = () => {
    clearTimers();
    setMode("ready");
    setStatus(trialCopy.intro);
    setBaseline(null);
    setManualMode(false);
    manualModeRef.current = false;
    manualControl.current = { x: 0, y: 0 };
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    resetOracle();
  };

  const finish = async (score: number, prediction?: string) => {
    setMode("complete");
    setBaseline(null);
    setManualMode(false);
    manualModeRef.current = false;
    setStatus(context === "fonin" ? trialCopy.foninSuccess : trialCopy.success);
    const saved = await onComplete?.({ kind, score, prediction });
    if (saved === false) {
      setStatus(ui.common.completionError);
      setMode("ready");
    }
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);

  useEffect(() => {
    if (!fullscreenActive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreenActive]);

  useEffect(() => {
    const updateArenaSize = () => {
      const arena = arenaRef.current;
      if (!arena) return;
      const rect = arena.getBoundingClientRect();
      const egg = arena.querySelector<HTMLElement>(".motion-chalaza-egg");
      arenaSize.current = {
        width: rect.width,
        height: rect.height,
        eggWidth: egg?.offsetWidth ?? 180,
        eggHeight: egg?.offsetHeight ?? 180,
      };
    };
    updateArenaSize();
    const resizeObserver = new ResizeObserver(updateArenaSize);
    if (arenaRef.current) resizeObserver.observe(arenaRef.current);
    const egg = arenaRef.current?.querySelector<HTMLElement>(
      ".motion-chalaza-egg",
    );
    if (egg) resizeObserver.observe(egg);
    window.addEventListener("resize", updateArenaSize);
    window.addEventListener("orientationchange", updateArenaSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateArenaSize);
      window.removeEventListener("orientationchange", updateArenaSize);
    };
  }, [fullscreenActive]);

  useEffect(() => {
    const selectPrediction = () => {
      const predictions = oraclePredictions[lang];
      return predictions[Math.floor(Math.random() * predictions.length)];
    };

    const finishOracleSequence = (peaks: number[]) => {
      if (kind !== "oracle" || modeRef.current !== "playing") return;
      if (oracleResolved.current || manualModeRef.current) return;
      oracleResolved.current = true;
      if (oracleTimeoutTimer.current)
        window.clearTimeout(oracleTimeoutTimer.current);

      const averagePeak =
        peaks.reduce((total, peak) => total + peak, 0) / peaks.length;
      setShakePower(0);
      if (averagePeak >= ORACLE_SUCCESS_MIN_MAGNITUDE) {
        const target =
          (ORACLE_SUCCESS_MIN_MAGNITUDE + ORACLE_SUCCESS_MAX_MAGNITUDE) / 2;
        const score = clamp(
          100 - Math.abs(averagePeak - target) * 4,
          82,
          100,
        );
        const prediction = selectPrediction();
        setOracleAnswer(prediction);
        void finish(score, prediction);
        return;
      }
      setOracleAnswer(ui.oracle.silent);
      setStatus(ui.oracle.tooQuiet);
      setMode("ready");
    };

    const finishOracleShake = () => {
      oracleSettleTimer.current = null;
      if (
        kind !== "oracle" ||
        modeRef.current !== "playing" ||
        manualModeRef.current ||
        oracleResolved.current ||
        !oracleShakeInProgress.current
      )
        return;

      oracleShakeInProgress.current = false;
      const peak = shakePeak.current;
      shakePeak.current = 0;

      if (peak > ORACLE_SUCCESS_MAX_MAGNITUDE) {
        oracleResolved.current = true;
        if (oracleTimeoutTimer.current)
          window.clearTimeout(oracleTimeoutTimer.current);
        setShakePower(1);
        setOracleBroken(true);
        setOracleAnswer(ui.oracle.broken);
        setStatus(ui.oracle.tooStrong);
        vibrate([160, 70, 220]);
        setMode("ready");
        return;
      }

      oracleShakePeaks.current = [...oracleShakePeaks.current, peak];
      oracleShakeCount.current = oracleShakePeaks.current.length;
      setShakePower(oracleShakeCount.current / ORACLE_REQUIRED_SHAKES);

      if (oracleShakeCount.current >= ORACLE_REQUIRED_SHAKES) {
        finishOracleSequence(oracleShakePeaks.current);
        return;
      }

      const progress =
        oracleShakeCount.current === 1
          ? ui.oracle.firstShake
          : ui.oracle.secondShake;
      setStatus(progress);
      setOracleAnswer(progress);
      vibrate(70);
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const next = {
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      };
      latestOrientation.current = next;
      setOrientation(next);
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      if (
        kind !== "oracle" ||
        modeRef.current !== "playing" ||
        manualModeRef.current ||
        oracleResolved.current
      )
        return;
      const acc = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acc) return;
      const magnitude = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0);

      if (
        !oracleShakeInProgress.current &&
        magnitude >= ORACLE_SHAKE_START_MAGNITUDE
      ) {
        oracleShakeInProgress.current = true;
        shakePeak.current = magnitude;
      }

      if (
        oracleShakeInProgress.current &&
        magnitude >= ORACLE_SHAKE_ACTIVE_MAGNITUDE
      ) {
        shakePeak.current = Math.max(shakePeak.current, magnitude);
        setShakePower(
          clamp(
            (oracleShakeCount.current + 0.5) / ORACLE_REQUIRED_SHAKES,
            0,
            1,
          ),
        );
        const now = performance.now();
        if (now - oracleLastVibration.current >= ORACLE_VIBRATION_INTERVAL_MS) {
          oracleLastVibration.current = now;
          vibrate(45);
        }
        if (oracleSettleTimer.current) {
          window.clearTimeout(oracleSettleTimer.current);
          oracleSettleTimer.current = null;
        }
      }

      if (
        oracleShakeInProgress.current &&
        magnitude < ORACLE_SHAKE_ACTIVE_MAGNITUDE &&
        !oracleSettleTimer.current
      ) {
        oracleSettleTimer.current = window.setTimeout(
          finishOracleShake,
          ORACLE_SHAKE_RELEASE_MS,
        );
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
      clearTimers();
    };
  }, [kind, lang]);

  useEffect(() => {
    if (kind !== "chalaza" || mode !== "playing") return;
    let frame = 0;
    let last = performance.now();
    const startedAt = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(80, now - last);
      last = now;
      const t = (now - startedAt) / 1000;
      const state = chalazaState.current;
      const sensorControlX = baseline
        ? (latestOrientation.current.gamma - baseline.gamma) /
          CHALAZA_CONTROL_DIVISOR
        : 0;
      const sensorControlY = baseline
        ? (latestOrientation.current.beta - baseline.beta) /
          CHALAZA_CONTROL_DIVISOR
        : 0;
      const driftX =
        Math.sin(t * 0.9) * 0.13 +
        Math.cos(t * 0.37) * 0.08 +
        Math.sin(t * 2.25) * 0.055;
      const driftY = Math.cos(t * 0.72) * 0.12 + Math.sin(t * 1.85) * 0.045;
      if (manualMode) {
        const frameScale = clamp(dt / 16.67, 0.5, 2.5);
        const response = 1 - Math.pow(1 - CHALAZA_MANUAL_RESPONSE, frameScale);
        const targetVx =
          manualControl.current.x * CHALAZA_MANUAL_SPEED +
          driftX * CHALAZA_MANUAL_DRIFT;
        const targetVy =
          manualControl.current.y * CHALAZA_MANUAL_SPEED +
          driftY * CHALAZA_MANUAL_DRIFT;
        state.vx += (targetVx - state.vx) * response;
        state.vy += (targetVy - state.vy) * response;
      } else {
        const forceX = -sensorControlX * CHALAZA_CONTROL_FORCE;
        const forceY = -sensorControlY * CHALAZA_CONTROL_FORCE;
        state.vx += (driftX + forceX) * (dt / 1000);
        state.vy += (driftY + forceY) * (dt / 1000);
        state.vx *= CHALAZA_DAMPING;
        state.vy *= CHALAZA_DAMPING;
      }
      state.x = clamp(
        state.x + state.vx * (dt / CHALAZA_POSITION_STEP_MS),
        -CHALAZA_FRAME_LIMIT,
        CHALAZA_FRAME_LIMIT,
      );
      state.y = clamp(
        state.y + state.vy * (dt / CHALAZA_POSITION_STEP_MS),
        -CHALAZA_FRAME_LIMIT,
        CHALAZA_FRAME_LIMIT,
      );

      const visualEggWidth =
        arenaSize.current.eggWidth * CHALAZA_VISUAL_EGG_WIDTH_RATIO;
      const visualEggHeight =
        arenaSize.current.eggHeight * CHALAZA_VISUAL_EGG_HEIGHT_RATIO;
      const horizontalTravel = Math.max(
        16,
        (arenaSize.current.width - visualEggWidth) / 2 - 2,
      );
      const verticalTravel = Math.max(
        16,
        (arenaSize.current.height - visualEggHeight) / 2 - 2,
      );
      const nextOffset = {
        x: (state.x / CHALAZA_FRAME_LIMIT) * horizontalTravel,
        y: (state.y / CHALAZA_FRAME_LIMIT) * verticalTravel,
      };
      const distance = distanceFromCenter(state);
      const touchesFrame =
        Math.abs(state.x) >= CHALAZA_FRAME_LIMIT ||
        Math.abs(state.y) >= CHALAZA_FRAME_LIMIT;

      if (distance < CHALAZA_CENTER_RADIUS) state.holdMs += dt;
      else state.holdMs = Math.max(0, state.holdMs - dt * 0.8);
      setEggOffset(nextOffset);
      setChalazaHoldMs(state.holdMs);

      if (touchesFrame) {
        setChalazaRolledAway(true);
        setStatus(ui.chalaza.rolledAway);
        vibrate([140, 60, 220]);
        rollTimer.current = window.setTimeout(() => {
          setChalazaRolledAway(false);
          setEggOffset({ x: 0, y: 0 });
          chalazaState.current = {
            x: 0,
            y: 0,
            vx: 0.006,
            vy: -0.003,
            holdMs: 0,
            completed: false,
          };
          setChalazaHoldMs(0);
          setMode("ready");
          setStatus(ui.chalaza.retryAfterRoll);
        }, 1150);
        return;
      }
      if (state.holdMs >= CHALAZA_HOLD_MS && !state.completed) {
        state.completed = true;
        void finish(94);
        return;
      }
      setStatus(
        distance < CHALAZA_CENTER_RADIUS
          ? ui.chalaza.centered
          : ui.chalaza.drifting,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [kind, mode, baseline, manualMode, lang]);

  useEffect(() => {
    if (!manualMode || kind !== "chalaza" || mode !== "playing") return;
    const handleKey = (event: KeyboardEvent) => {
      const controls: Record<string, Vector2> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      if (controls[event.key]) {
        event.preventDefault();
        manualControl.current = controls[event.key];
      }
    };
    const stop = () => {
      manualControl.current = { x: 0, y: 0 };
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", stop);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", stop);
    };
  }, [manualMode, kind, mode]);

  const calibrate = async () => {
    const allowed = await requestMotionPermission();
    if (!allowed) {
      setStatus(ui.common.permissionDenied);
      return;
    }
    setMode("calibrating");
    setStatus(ui.chalaza.calibrationStatus);
    calibrationTimer.current = window.setTimeout(() => {
      const current = latestOrientation.current;
      const unavailable =
        Math.abs(current.alpha) < 0.01 &&
        Math.abs(current.beta) < 0.01 &&
        Math.abs(current.gamma) < 0.01;
      if (unavailable) {
        setMode("ready");
        setStatus(ui.chalaza.sensorUnavailable);
        return;
      }
      setBaseline(current);
      setMode("ready");
      setStatus(ui.chalaza.calibrated);
    }, 3000);
  };

  const startChalaza = (manual: boolean) => {
    if (!manual && !baseline) return;
    setManualMode(manual);
    manualModeRef.current = manual;
    manualControl.current = { x: 0, y: 0 };
    chalazaState.current = {
      x: 0,
      y: 0,
      vx: 0.006,
      vy: -0.003,
      holdMs: 0,
      completed: false,
    };
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    setMode("playing");
    setStatus(manual ? ui.chalaza.manualStatus : ui.chalaza.playing);
    vibrate(35);
  };

  const startOracle = async (manual: boolean) => {
    if (!manual && !(await requestMotionPermission())) {
      setStatus(ui.common.permissionDenied);
      return;
    }
    clearTimers();
    resetOracle();
    setManualMode(manual);
    manualModeRef.current = manual;
    setMode("playing");
    setStatus(manual ? ui.oracle.manualStatus : ui.oracle.playing);
    setOracleAnswer(manual ? ui.oracle.manualStatus : ui.oracle.playing);
    vibrate(35);
    oracleTimeoutTimer.current = window.setTimeout(() => {
      if (modeRef.current !== "playing" || oracleResolved.current) return;
      oracleResolved.current = true;
      setShakePower(0);
      setOracleAnswer(ui.oracle.silent);
      setStatus(ui.oracle.tooQuiet);
      setMode("ready");
    }, ORACLE_TIMEOUT_MS);
  };

  const handleManualOracleTap = () => {
    if (kind !== "oracle" || !manualMode || mode !== "playing") return;
    const now = performance.now();
    manualTaps.current = [...manualTaps.current, now].slice(-3);
    setShakePower(manualTaps.current.length / 3);
    vibrate(35);
    if (manualTaps.current.length < 3) return;
    oracleResolved.current = true;
    if (oracleTimeoutTimer.current)
      window.clearTimeout(oracleTimeoutTimer.current);
    const span = manualTaps.current[2] - manualTaps.current[0];
    if (span < ORACLE_MANUAL_TOO_FAST_MS) {
      setOracleBroken(true);
      setOracleAnswer(ui.oracle.broken);
      setStatus(ui.oracle.tooStrong);
      setMode("ready");
      vibrate([160, 70, 220]);
      return;
    }
    if (span <= ORACLE_MANUAL_TOO_SLOW_MS) {
      const predictionList = oraclePredictions[lang];
      const prediction =
        predictionList[Math.floor(Math.random() * predictionList.length)];
      setOracleAnswer(prediction);
      const score = Math.round(
        clamp(100 - Math.abs(span - ORACLE_MANUAL_IDEAL_MS) / 30, 82, 100),
      );
      void finish(score, prediction);
      return;
    }
    setOracleAnswer(ui.oracle.silent);
    setStatus(ui.oracle.tooQuiet);
    setMode("ready");
  };

  const setManualDirection = (direction: Vector2) => {
    manualControl.current = direction;
  };

  const trial = (
    <section
      className={`motion-trial ${fullscreenActive ? "motion-trial--fullscreen" : ""}`}
      aria-label={trialCopy.title}
    >
      {fullscreenActive ? (
        <button className="motion-close" type="button" onClick={reset}>
          {ui.chalaza.close}
        </button>
      ) : null}
      <p className="motion-kicker">{trialCopy.kicker}</p>
      <h2>{trialCopy.title}</h2>
      <p className="motion-status" role="status">
        {status}
      </p>

      {kind === "chalaza" ? (
        <div
          className={`motion-chalaza-arena ${chalazaRolledAway ? "motion-chalaza-arena--rolled-away" : ""}`}
          ref={arenaRef}
          onPointerDown={(event) => {
            if (!manualMode || mode !== "playing") return;
            const rect = event.currentTarget.getBoundingClientRect();
            setManualDirection({
              x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
              y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1),
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!manualMode || mode !== "playing" || event.buttons === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setManualDirection({
              x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
              y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1),
            });
          }}
          onPointerUp={() => setManualDirection({ x: 0, y: 0 })}
          onPointerCancel={() => setManualDirection({ x: 0, y: 0 })}
        >
          <div className="motion-chalaza-target" />
          <MonumentalEggModel offset={eggOffset} />
          <div className="motion-chalaza-progress">
            <span
              style={{
                transform: `scaleX(${clamp(chalazaHoldMs / CHALAZA_HOLD_MS, 0, 1)})`,
              }}
            />
          </div>
        </div>
      ) : (
        <div
          className={`motion-oracle ${oracleBroken ? "motion-oracle--broken" : ""} ${mode === "complete" ? "motion-oracle--answered" : ""}`}
        >
          <button
            className="motion-oracle-orb"
            type="button"
            onClick={handleManualOracleTap}
            disabled={!manualMode || mode !== "playing"}
            aria-label={manualMode ? ui.oracle.manualStatus : ui.oracle.title}
          >
            <span
              className="motion-oracle-yolk"
              style={{
                transform: `scale(${1 + shakePower * 0.24}) rotate(${shakePower * 18}deg)`,
              }}
            >
              <span>8</span>
            </span>
          </button>
          <div className="motion-oracle-reading" aria-live="polite">
            {mode === "complete" ? (
              <span className="motion-oracle-result-label">
                {ui.oracle.result}
              </span>
            ) : null}
            <p className="motion-oracle-answer">{oracleAnswer}</p>
          </div>
        </div>
      )}

      {!manualMode && mode !== "complete" ? (
        <SensorReadout orientation={orientation} label={ui.common.sensorLabel} />
      ) : null}

      {kind === "chalaza" && manualMode && mode === "playing" ? (
        <div className="motion-pad" aria-label={ui.common.manualLabel}>
          {([
            ["↑", { x: 0, y: -1 }],
            ["←", { x: -1, y: 0 }],
            ["→", { x: 1, y: 0 }],
            ["↓", { x: 0, y: 1 }],
          ] as const).map(([label, direction]) => (
            <button
              key={label}
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setManualDirection(direction);
              }}
              onPointerUp={() => setManualDirection({ x: 0, y: 0 })}
              onPointerCancel={() => setManualDirection({ x: 0, y: 0 })}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="motion-actions">
        {kind === "chalaza" && !baseline && !manualMode && mode !== "complete" ? (
          <button type="button" onClick={() => void calibrate()} disabled={mode === "calibrating"}>
            {mode === "calibrating" ? ui.chalaza.calibrating : ui.chalaza.calibrate}
          </button>
        ) : null}
        {kind === "chalaza" && baseline && mode === "ready" ? (
          <button type="button" onClick={() => startChalaza(false)}>
            {ui.chalaza.start}
          </button>
        ) : null}
        {kind === "oracle" && mode === "ready" ? (
          <button type="button" onClick={() => void startOracle(false)}>
            {ui.oracle.ask}
          </button>
        ) : null}
        {mode === "ready" && !manualMode ? (
          <button
            className="motion-secondary"
            type="button"
            onClick={() =>
              kind === "chalaza" ? startChalaza(true) : void startOracle(true)
            }
          >
            {trialCopy.manual}
          </button>
        ) : null}
        {mode === "ready" && manualMode ? (
          <button
            type="button"
            onClick={() =>
              kind === "chalaza" ? startChalaza(true) : void startOracle(true)
            }
          >
            {trialCopy.reset}
          </button>
        ) : null}
        {mode === "complete" && context !== "fonin" ? (
          <button type="button" onClick={reset}>
            {trialCopy.reset}
          </button>
        ) : null}
      </div>
    </section>
  );

  return fullscreenActive && typeof document !== "undefined"
    ? createPortal(trial, document.body)
    : trial;
};
