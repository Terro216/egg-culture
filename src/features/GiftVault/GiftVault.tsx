import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./GiftVault.css";

const gifts = [
  {
    id: "first-steep",
    number: "I",
    title: "Первая печать",
    shop: "Чайный дом №1",
  },
  {
    id: "second-dome",
    number: "II",
    title: "Вторая печать",
    shop: "Чайный дом №2",
  },
  {
    id: "third-yolk",
    number: "III",
    title: "Третья печать",
    shop: "Дело чайного гномика",
  },
];

const ritualStages = [
  {
    kind: "pour" as const,
    giftId: "first-steep",
    title: "Чахай и пиала",
    intro:
      "Плавно поверните телефон, будто переливаете настой из чахая в пиалу. Главное — не перелить.",
  },
  {
    kind: "chalaza" as const,
    giftId: "second-dome",
    title: "Халаза-тест",
    intro:
      "Удержите яйцо в центре. Даже идеальная неподвижность не спасает: форма начнет укатываться, ее придется ловить наклоном.",
  },
  {
    kind: "oracle" as const,
    giftId: "third-yolk",
    title: "Оракул желтка",
    intro:
      "Спросите оракула, как Magic 8 Ball. Нужен один уверенный, но не варварский встрях.",
  },
];

type GiftStatus = "sealed" | "opening" | "opened" | "error";
type RitualMode =
  | "locked"
  | "ready"
  | "calibrating"
  | "pouring"
  | "chalaza"
  | "oracle"
  | "complete";
type Orientation = { alpha: number; beta: number; gamma: number };
type Vector2 = { x: number; y: number };

type GiftState = {
  status: GiftStatus;
  message?: string;
  opened?: { certificate: string; note?: string };
};

const initialGiftState = gifts.reduce<Record<string, GiftState>>(
  (acc, gift) => {
    acc[gift.id] = { status: "sealed" };
    return acc;
  },
  {},
);

const emptyOrientation: Orientation = { alpha: 0, beta: 0, gamma: 0 };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distanceFromCenter = (point: Vector2) => Math.hypot(point.x, point.y);
const CHALAZA_CENTER_RADIUS = 0.43;
const CHALAZA_FRAME_LIMIT = 1.08;
const CHALAZA_CONTROL_DIVISOR = 40;
const CHALAZA_CONTROL_FORCE = 0.56;
const CHALAZA_DAMPING = 0.91;
const CHALAZA_POSITION_STEP_MS = 20.6;
const ORACLE_SHAKE_ACTIVE_MAGNITUDE = 13;
const ORACLE_SHAKE_START_MAGNITUDE = 16;
const ORACLE_SUCCESS_MIN_MAGNITUDE = 24;
const ORACLE_SUCCESS_MAX_MAGNITUDE = 30;
const ORACLE_SETTLE_MS = 700;
const ORACLE_TIMEOUT_MS = 5000;
const ORACLE_VIBRATION_INTERVAL_MS = 110;

type VibrationPattern = number | number[];
type VibratingNavigator = Navigator & {
  vibrate?: (pattern: VibrationPattern) => boolean;
  webkitVibrate?: (pattern: VibrationPattern) => boolean;
};

const vibrate = (pattern: VibrationPattern) => {
  if (typeof window === "undefined") return false;

  const vibratingNavigator = window.navigator as VibratingNavigator;
  const vibration =
    vibratingNavigator.vibrate ?? vibratingNavigator.webkitVibrate;

  return vibration?.call(vibratingNavigator, pattern) ?? false;
};

// Живой вывод β/γ вынесен в отдельный компонент: deviceorientation стреляет
// ~60 раз в секунду, и держать эти данные в state родителя означало бы
// ре-рендерить весь GiftVault на каждое событие сенсора.
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
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  return (
    <div className="sensor-readout">
      <span>β {orientation.beta.toFixed(0)}°</span>
      <span>γ {orientation.gamma.toFixed(0)}°</span>
    </div>
  );
};

const MonumentalEggModel: React.FC<{ offset: Vector2 }> = ({ offset }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // animate() живет в эффекте с пустыми deps и видит только первый offset —
  // актуальное значение прокидываем через ref.
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
      className="chalaza-egg-model"
      ref={containerRef}
      style={
        {
          "--egg-x": `${offset.x}px`,
          "--egg-y": `${offset.y}px`,
          transform: `translate(var(--egg-x), var(--egg-y)) rotate(${offset.x * 0.08}deg)`,
        } as React.CSSProperties
      }
    />
  );
};

export const GiftVault: React.FC = () => {
  const [accessWord, setAccessWord] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);
  const [mode, setMode] = useState<RitualMode>("locked");
  const [stageIndex, setStageIndex] = useState(0);
  const [baseline, setBaseline] = useState<Orientation | null>(null);
  const [statusText, setStatusText] = useState(
    "Введите кодовое слово, чтобы начать процедуру.",
  );
  const [giftStates, setGiftStates] =
    useState<Record<string, GiftState>>(initialGiftState);
  const [pourFill, setPourFill] = useState(0);
  const [pourSpill, setPourSpill] = useState(0);
  const [eggOffset, setEggOffset] = useState<Vector2>({ x: 0, y: 0 });
  const [chalazaHoldMs, setChalazaHoldMs] = useState(0);
  const [chalazaRolledAway, setChalazaRolledAway] = useState(false);
  const [shakePower, setShakePower] = useState(0);
  const [oracleAnswer, setOracleAnswer] = useState(
    "Желток молчит внутри шара.",
  );
  const [oracleBroken, setOracleBroken] = useState(false);

  const latestOrientation = useRef<Orientation>(emptyOrientation);
  const accessWordRef = useRef(accessWord);
  const chalazaArenaRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<RitualMode>("locked");
  const stageIndexRef = useRef(0);
  const calibrationTimer = useRef<number | null>(null);
  const chalazaRollTimer = useRef<number | null>(null);
  // Размер арены держим в ref: мобильные браузеры кидают resize при скрытии
  // адресной строки, а перезапуск игрового эффекта из-за deps сбрасывал бы
  // фазу дрейфа посреди игры.
  const chalazaArenaSize = useRef({ width: 320, height: 420 });
  const pourState = useRef({ fill: 0, spill: 0, completed: false });
  const chalazaState = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    holdMs: 0,
    completed: false,
  });
  const shakePeak = useRef(0);
  const oracleLastVibration = useRef(0);
  const oracleShakeStarted = useRef(false);
  const oracleResolved = useRef(false);
  const oracleSettleTimer = useRef<number | null>(null);
  const oracleTimeoutTimer = useRef<number | null>(null);

  const stage = ritualStages[stageIndex];
  const chalazaFullscreenActive =
    stage.kind === "chalaza" &&
    (mode === "calibrating" ||
      mode === "chalaza" ||
      (mode === "ready" && Boolean(baseline)));
  const openedCount = useMemo(
    () =>
      Object.values(giftStates).filter((state) => state.status === "opened")
        .length,
    [giftStates],
  );

  const clearOracleTimers = () => {
    if (oracleSettleTimer.current) {
      window.clearTimeout(oracleSettleTimer.current);
      oracleSettleTimer.current = null;
    }
    if (oracleTimeoutTimer.current) {
      window.clearTimeout(oracleTimeoutTimer.current);
      oracleTimeoutTimer.current = null;
    }
  };

  const resetOracleState = () => {
    clearOracleTimers();
    shakePeak.current = 0;
    oracleShakeStarted.current = false;
    oracleResolved.current = false;
    oracleLastVibration.current = 0;
    setShakePower(0);
    setOracleBroken(false);
    vibrate(0);
  };

  useEffect(() => {
    accessWordRef.current = accessWord;
  }, [accessWord]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    stageIndexRef.current = stageIndex;
  }, [stageIndex]);

  useEffect(() => {
    const updateArenaSize = () => {
      const arena = chalazaArenaRef.current;
      if (!arena) return;

      const rect = arena.getBoundingClientRect();
      chalazaArenaSize.current = { width: rect.width, height: rect.height };
    };

    updateArenaSize();
    window.addEventListener("resize", updateArenaSize);
    window.addEventListener("orientationchange", updateArenaSize);

    return () => {
      window.removeEventListener("resize", updateArenaSize);
      window.removeEventListener("orientationchange", updateArenaSize);
    };
  }, [chalazaFullscreenActive]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      latestOrientation.current = {
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      };
    };

    const finishOracleShake = () => {
      if (modeRef.current !== "oracle" || oracleResolved.current) return;

      oracleResolved.current = true;
      clearOracleTimers();

      const peak = shakePeak.current;
      setShakePower(0);

      if (peak > ORACLE_SUCCESS_MAX_MAGNITUDE) {
        setOracleBroken(true);
        setOracleAnswer(
          "Оракул треснул. Желток расплескал знаки и отказался отвечать.",
        );
        setStatusText(
          "Слишком сильная тряска. Оракул сломался — попробуйте ещё раз мягче.",
        );
        vibrate([160, 70, 220]);
        setMode("ready");
        return;
      }

      if (peak >= ORACLE_SUCCESS_MIN_MAGNITUDE) {
        const target =
          (ORACLE_SUCCESS_MIN_MAGNITUDE + ORACLE_SUCCESS_MAX_MAGNITUDE) / 2;
        const score = clamp(100 - Math.abs(peak - target) * 4, 82, 100);
        setOracleAnswer("Ответ оракула: знаки благоприятны.");
        setStatusText("Оракул желтка пробужден. Третья печать поддалась.");
        setMode("complete");
        void completeStage(3, score);
        return;
      }

      setOracleAnswer("Оракул не почувствовал вопрос.");
      setStatusText("Слишком тихо. Желток не проснулся.");
      setMode("ready");
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acc) return;

      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const magnitude = Math.hypot(x, y, z);

      if (modeRef.current !== "oracle" || oracleResolved.current) return;

      if (magnitude >= ORACLE_SHAKE_ACTIVE_MAGNITUDE) {
        shakePeak.current = Math.max(shakePeak.current, magnitude);
        const shakeLevel = clamp(
          (magnitude - ORACLE_SHAKE_ACTIVE_MAGNITUDE) /
            (ORACLE_SUCCESS_MAX_MAGNITUDE - ORACLE_SHAKE_ACTIVE_MAGNITUDE),
          0,
          1,
        );
        setShakePower(
          clamp(
            (shakePeak.current - ORACLE_SHAKE_ACTIVE_MAGNITUDE) /
              (ORACLE_SUCCESS_MAX_MAGNITUDE - ORACLE_SHAKE_ACTIVE_MAGNITUDE),
            0,
            1,
          ),
        );

        const now = performance.now();
        if (now - oracleLastVibration.current >= ORACLE_VIBRATION_INTERVAL_MS) {
          oracleLastVibration.current = now;
          vibrate(Math.round(25 + shakeLevel * 95));
        }
      }

      if (magnitude >= ORACLE_SHAKE_START_MAGNITUDE) {
        oracleShakeStarted.current = true;
      }

      if (
        oracleShakeStarted.current &&
        magnitude >= ORACLE_SHAKE_ACTIVE_MAGNITUDE
      ) {
        if (oracleSettleTimer.current) {
          window.clearTimeout(oracleSettleTimer.current);
        }
        oracleSettleTimer.current = window.setTimeout(
          finishOracleShake,
          ORACLE_SETTLE_MS,
        );
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
      if (calibrationTimer.current)
        window.clearTimeout(calibrationTimer.current);
      if (chalazaRollTimer.current)
        window.clearTimeout(chalazaRollTimer.current);
      clearOracleTimers();
    };
  }, []);

  useEffect(() => {
    if (mode !== "pouring" || !baseline || stage.kind !== "pour") return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(80, now - last);
      last = now;

      const angle = Math.max(
        0,
        latestOrientation.current.gamma - baseline.gamma,
      );
      const isPouring = angle > 9;
      const tooSteep = angle > 52;
      const state = pourState.current;

      if (isPouring) {
        state.fill = clamp(
          state.fill + ((angle - 7) / 42) * (dt / 3600),
          0,
          1.12,
        );
      }

      if (tooSteep) {
        state.spill = clamp(
          state.spill + ((angle - 52) / 24) * (dt / 950),
          0,
          1,
        );
      }

      setPourFill(state.fill);
      setPourSpill(state.spill);

      if (state.spill > 0.24 || state.fill > 0.99) {
        setStatusText(
          "Пиала перелита. Верните чахай к тишине и попробуйте снова.",
        );
        setMode("ready");
        return;
      }

      if (
        state.fill >= 0.84 &&
        state.fill <= 0.91 &&
        angle < 6 &&
        !state.completed
      ) {
        state.completed = true;
        const score = Math.round(
          100 - Math.abs(state.fill - 0.875) * 220 - state.spill * 110,
        );
        setStatusText("Пиала наполнена ровно. Первая печать поддалась.");
        setMode("complete");
        void completeStage(1, clamp(score, 75, 100));
        return;
      }

      if (state.fill < 0.84) {
        setStatusText(
          isPouring
            ? "Настой идет. Держите струю ровной."
            : "Начните плавный наклон вправо.",
        );
      } else {
        setStatusText(
          "Почти достаточно. Верните телефон ровно, чтобы остановить струю.",
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, baseline, stage.kind]);

  useEffect(() => {
    if (mode !== "chalaza" || !baseline || stage.kind !== "chalaza") return;

    let frame = 0;
    let last = performance.now();
    const startedAt = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(80, now - last);
      last = now;
      const t = (now - startedAt) / 1000;
      const state = chalazaState.current;

      const controlX =
        (latestOrientation.current.gamma - baseline.gamma) /
        CHALAZA_CONTROL_DIVISOR;
      const controlY =
        (latestOrientation.current.beta - baseline.beta) /
        CHALAZA_CONTROL_DIVISOR;
      const driftX =
        Math.sin(t * 0.9) * 0.13 +
        Math.cos(t * 0.37) * 0.08 +
        Math.sin(t * 2.25) * 0.055;
      const driftY = Math.cos(t * 0.72) * 0.12 + Math.sin(t * 1.85) * 0.045;

      state.vx += (driftX - controlX * CHALAZA_CONTROL_FORCE) * (dt / 1000);
      state.vy += (driftY - controlY * CHALAZA_CONTROL_FORCE) * (dt / 1000);
      state.vx *= CHALAZA_DAMPING;
      state.vy *= CHALAZA_DAMPING;
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

      const maxOffsetX = Math.max(40, chalazaArenaSize.current.width / 2);
      const maxOffsetY = Math.max(40, chalazaArenaSize.current.height / 2);
      const nextOffset = {
        x: state.x * maxOffsetX,
        y: state.y * maxOffsetY,
      };

      const distance = distanceFromCenter(state);
      const touchesFrame =
        Math.abs(state.x) >= CHALAZA_FRAME_LIMIT ||
        Math.abs(state.y) >= CHALAZA_FRAME_LIMIT;

      if (distance < CHALAZA_CENTER_RADIUS) {
        state.holdMs += dt;
      } else {
        state.holdMs = Math.max(0, state.holdMs - dt * 0.8);
      }

      setEggOffset(nextOffset);
      setChalazaHoldMs(state.holdMs);

      if (touchesFrame) {
        setChalazaRolledAway(true);
        setStatusText("Яйцо укатилось за край блюда.");
        vibrate([140, 60, 220]);
        chalazaRollTimer.current = window.setTimeout(() => {
          chalazaRollTimer.current = null;
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
          setStatusText("Попробуйте снова. У нас еще много больших яиц.");
        }, 1150);
        return;
      }

      if (state.holdMs >= 4200 && !state.completed) {
        state.completed = true;
        setStatusText("Халаза удержала форму. Вторая печать поддалась.");
        setBaseline(null);
        setMode("complete");
        void completeStage(2, 94);
        return;
      }

      setStatusText(
        distance < CHALAZA_CENTER_RADIUS
          ? "Центр пойман. Удерживайте."
          : "Яйцо уходит. Ловите наклоном телефона.",
      );
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, baseline, stage.kind]);

  const requestMotionIfNeeded = async () => {
    // На iOS 13+ у deviceorientation и devicemotion отдельные requestPermission —
    // для оракула (встряхивание) нужен именно второй.
    type PermissionRequester = {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const maybeDeviceOrientation =
      DeviceOrientationEvent as unknown as PermissionRequester;
    const maybeDeviceMotion =
      typeof DeviceMotionEvent !== "undefined"
        ? (DeviceMotionEvent as unknown as PermissionRequester)
        : undefined;

    if (typeof maybeDeviceOrientation.requestPermission === "function") {
      const permission = await maybeDeviceOrientation.requestPermission();
      if (permission !== "granted") return false;
    }

    if (typeof maybeDeviceMotion?.requestPermission === "function") {
      const permission = await maybeDeviceMotion.requestPermission();
      return permission === "granted";
    }

    return true;
  };

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
      setStatusText(
        "Не удалось связаться с кладкой. Проверьте сервер и попробуйте снова.",
      );
    } finally {
      setAccessChecking(false);
    }
  };

  const calibrate = async () => {
    const hasMotionAccess = await requestMotionIfNeeded();
    if (!hasMotionAccess) {
      setStatusText(
        "Датчики движения недоступны. Разрешите доступ браузеру и попробуйте снова.",
      );
      return;
    }

    setMode("calibrating");
    setStatusText("Положите телефон на стол и не двигайте 3 секунды.");

    calibrationTimer.current = window.setTimeout(() => {
      const currentOrientation = latestOrientation.current;
      const sensorsLookUnavailable =
        Math.abs(currentOrientation.alpha) < 0.01 &&
        Math.abs(currentOrientation.beta) < 0.01 &&
        Math.abs(currentOrientation.gamma) < 0.01;

      if (sensorsLookUnavailable) {
        setMode("ready");
        setStatusText(
          "Датчики движения не отдают данные. На Samsung проверьте HTTPS, Chrome/Samsung Internet и доступ к датчикам.",
        );
        return;
      }

      setBaseline(currentOrientation);
      setMode("ready");
      setStatusText("Нулевое положение считано. Можно начинать испытание.");
    }, 3000);
  };

  const startStage = async () => {
    if (stage.kind !== "oracle" && !baseline) {
      setStatusText(
        "Сначала положите телефон на стол и считайте нулевое положение.",
      );
      return;
    }

    if (stage.kind === "pour") {
      pourState.current = { fill: 0, spill: 0, completed: false };
      setPourFill(0);
      setPourSpill(0);
      setMode("pouring");
      setStatusText(
        "Плавно наклоните вправо. Когда пиала почти наполнится — верните телефон ровно.",
      );
      return;
    }

    if (stage.kind === "chalaza") {
      vibrate(35);
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
      setMode("chalaza");
      setStatusText("Яйцо начинает уходить. Ловите центр наклоном телефона.");
      return;
    }

    const hasMotionAccess = await requestMotionIfNeeded();
    if (!hasMotionAccess) {
      setStatusText(
        "Датчики движения недоступны. Разрешите доступ браузеру и попробуйте снова.",
      );
      return;
    }

    resetOracleState();
    vibrate(35);
    setOracleAnswer("Спрос задан. Встряхните телефон как шар предсказаний.");
    setMode("oracle");
    setStatusText(
      "Один точный встрях: слабый не разбудит, слишком сильный сломает оракула.",
    );

    oracleTimeoutTimer.current = window.setTimeout(() => {
      if (
        modeRef.current === "oracle" &&
        !oracleShakeStarted.current &&
        !oracleResolved.current
      ) {
        oracleResolved.current = true;
        shakePeak.current = 0;
        setShakePower(0);
        setOracleAnswer("Оракул не почувствовал вопрос.");
        setStatusText("Слишком тихо. Желток не проснулся.");
        setMode("ready");
      }
    }, ORACLE_TIMEOUT_MS);
  };

  const completeStage = async (stageNumber: number, score: number) => {
    const completedStage = ritualStages[stageNumber - 1];
    setGiftStates((prev) => ({
      ...prev,
      [completedStage.giftId]: {
        ...prev[completedStage.giftId],
        status: "opening",
      },
    }));

    try {
      const response = await fetch("/api/fonin-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giftId: completedStage.giftId,
          accessWord: accessWordRef.current,
          ritual: { stage: stageNumber, score },
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setGiftStates((prev) => ({
          ...prev,
          [completedStage.giftId]: {
            ...prev[completedStage.giftId],
            status: "error",
            message: payload?.message ?? "Печать не открылась.",
          },
        }));
        setStatusText(payload?.message ?? "Печать не открылась.");
        setMode("ready");
        return;
      }

      setGiftStates((prev) => ({
        ...prev,
        [completedStage.giftId]: {
          status: "opened",
          opened: { certificate: payload.certificate, note: payload.note },
        },
      }));
    } catch {
      setGiftStates((prev) => ({
        ...prev,
        [completedStage.giftId]: {
          ...prev[completedStage.giftId],
          status: "error",
          message: "Связь с хранилищем прервалась. Попробуйте еще раз.",
        },
      }));
      setStatusText("Связь с хранилищем прервалась. Попробуйте еще раз.");
      setMode("ready");
    }
  };

  const retryStage = () => {
    if (calibrationTimer.current) {
      window.clearTimeout(calibrationTimer.current);
      calibrationTimer.current = null;
    }
    if (chalazaRollTimer.current) {
      window.clearTimeout(chalazaRollTimer.current);
      chalazaRollTimer.current = null;
    }
    setBaseline(null);
    setPourFill(0);
    setPourSpill(0);
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    resetOracleState();
    setOracleAnswer("Желток молчит внутри шара.");
    setMode("ready");
    setStatusText(stage.intro);
  };

  const goNextStage = () => {
    const nextStage = stageIndex + 1;
    if (nextStage >= ritualStages.length) {
      setStatusText("Все печати раскрыты. Процедура завершена.");
      return;
    }

    if (chalazaRollTimer.current) {
      window.clearTimeout(chalazaRollTimer.current);
      chalazaRollTimer.current = null;
    }
    setStageIndex(nextStage);
    setBaseline(null);
    setPourFill(0);
    setPourSpill(0);
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    resetOracleState();
    setOracleAnswer("Желток молчит внутри шара.");
    setMode("ready");
    setStatusText(ritualStages[nextStage].intro);
  };

  const renderStageVisual = () => {
    if (stage.kind === "pour") {
      return (
        <div className="pour-visual" aria-hidden="true">
          <div
            className="fair-cup"
            style={{ transform: `rotate(${pourFill > 0 ? 26 : 0}deg)` }}
          />
          <div
            className="pour-stream"
            style={{
              opacity:
                mode === "pouring" && pourFill < 0.98
                  ? clamp(pourFill + 0.15, 0, 1)
                  : 0,
            }}
          />
          <div
            className={`tea-cup ${pourSpill > 0.18 ? "tea-cup--danger" : ""}`}
          >
            <span
              style={{ transform: `scaleY(${clamp(pourFill, 0.04, 1)})` }}
            />
          </div>
          <div className="spill-meter">
            <span style={{ transform: `scaleX(${pourSpill})` }} />
          </div>
        </div>
      );
    }

    if (stage.kind === "chalaza") {
      return (
        <div
          className={`chalaza-arena ${chalazaFullscreenActive ? "chalaza-arena--fullscreen" : ""} ${chalazaRolledAway ? "chalaza-arena--rolled-away" : ""}`}
          ref={chalazaArenaRef}
          aria-hidden="true"
        >
          <div className="chalaza-target" />
          <MonumentalEggModel offset={eggOffset} />
          <div className="chalaza-progress">
            <span
              style={{
                transform: `scaleX(${clamp(chalazaHoldMs / 4200, 0, 1)})`,
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        className={`oracle-ball ${oracleBroken ? "oracle-ball--broken" : ""}`}
        aria-hidden="true"
      >
        <div
          className="oracle-yolk"
          style={{
            transform: `scale(${1 + shakePower * 0.24}) rotate(${shakePower * 18}deg)`,
          }}
        >
          <span>8</span>
        </div>
        <p>{oracleAnswer}</p>
      </div>
    );
  };

  return (
    <section
      className="gift-vault"
      aria-label="Три запечатанных дара Дмитрия Фонина"
    >
      <div className="vault-header">
        <p className="vault-kicker">Три испытания формы</p>
        <h1>Запечатанная кладка Дмитрия Фонина</h1>
        <p>
          Печати открываются не ответами, а движением: ровный пролив, ловля
          формы и желтковый оракул.
        </p>
        <span className="vault-progress">
          Открыто {openedCount} / {gifts.length}
        </span>
      </div>

      <div
        className={`ritual-panel ${chalazaFullscreenActive ? "ritual-panel--fullscreen" : ""}`}
      >
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
              onKeyDown={(event) => {
                if (event.key === "Enter") void unlockRitual();
              }}
            />
            <button
              className="gift-open-btn"
              type="button"
              disabled={accessChecking}
              onClick={() => void unlockRitual()}
            >
              {accessChecking ? "Сверяю…" : "Принять слово"}
            </button>
            <p className="gift-message" role="status">
              {statusText}
            </p>
          </div>
        ) : (
          <div
            className={`ritual-stage ${chalazaFullscreenActive ? "ritual-stage--game" : ""}`}
          >
            {chalazaFullscreenActive ? (
              <button
                className="fullscreen-close-btn"
                type="button"
                onClick={retryStage}
              >
                Закрыть испытание
              </button>
            ) : null}
            <p className="vault-kicker">
              Этап {stageIndex + 1} / {ritualStages.length}
            </p>
            <h2>{stage.title}</h2>
            <p>{statusText}</p>

            {renderStageVisual()}

            <SensorReadout />

            <div className="ritual-actions">
              {stage.kind !== "oracle" &&
              !(stage.kind === "chalaza" && baseline) ? (
                <button
                  className="gift-open-btn"
                  type="button"
                  onClick={calibrate}
                  disabled={mode === "calibrating"}
                >
                  {mode === "calibrating"
                    ? "Считываю стол…"
                    : "Положить на стол"}
                </button>
              ) : null}
              <button
                className="gift-open-btn"
                type="button"
                onClick={() => void startStage()}
                disabled={
                  mode === "calibrating" ||
                  mode === "pouring" ||
                  mode === "chalaza" ||
                  mode === "oracle"
                }
              >
                {stage.kind === "oracle"
                  ? "Спросить оракула"
                  : "Начать испытание"}
              </button>
              {mode === "ready" && !chalazaFullscreenActive ? (
                <button
                  className="gift-open-btn gift-open-btn--ghost"
                  type="button"
                  onClick={retryStage}
                >
                  Сбросить этап
                </button>
              ) : null}
              {giftStates[stage.giftId]?.status === "opened" &&
              stageIndex < ritualStages.length - 1 ? (
                <button
                  className="gift-open-btn"
                  type="button"
                  onClick={goNextStage}
                >
                  Следующая печать
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="gift-grid">
        {gifts.map((gift) => {
          const state = giftStates[gift.id];
          const opened = state.status === "opened";
          const certificate = state.opened?.certificate;
          const certificateIsLink =
            certificate?.startsWith("http") || certificate?.startsWith("/api/");

          return (
            <article
              className={`gift-card ${opened ? "gift-card--opened" : ""}`}
              key={gift.id}
            >
              <div className="gift-card-inner">
                <div
                  className="gift-card-face gift-card-front"
                  aria-hidden={opened}
                >
                  <span className="gift-number">{gift.number}</span>
                  <h2>{gift.title}</h2>
                  <p className="gift-shop">Содержимое скрыто до раскрытия</p>
                  <p className="gift-question">
                    Печать откроется после своего испытания.
                  </p>
                  {state.message && (
                    <p className="gift-message" role="status">
                      {state.message}
                    </p>
                  )}
                </div>

                <div
                  className="gift-card-face gift-card-back"
                  aria-hidden={!opened}
                >
                  <span className="gift-number">{gift.number}</span>
                  <p className="gift-unlocked">Печать раскрыта</p>
                  <h2>{gift.shop}</h2>
                  <p className="gift-certificate">
                    {certificateIsLink ? "Кодекс раскрыт." : certificate}
                  </p>
                  {certificateIsLink ? (
                    <a
                      className="gift-open-btn"
                      href={certificate}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть
                    </a>
                  ) : null}
                  {state.opened?.note && (
                    <p className="gift-note">{state.opened.note}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
