import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { motionCopy, oraclePredictions } from "./copy.ts";
import { ChalazaSimulation, CHALAZA_FRAME_LIMIT, CHALAZA_HOLD_MS } from "./chalaza.ts";
import type { TrialVector } from "./chalaza.ts";
import { chalazaTilt, emptyOrientation, oracleSensorScore, trialOrientation } from "./sensors.ts";
import type { TrialOrientation } from "./sensors.ts";
import { acceptsGameKey } from "../../shared/game/keyboard.ts";
import { useGameModal } from "../../shared/game/useGameModal.ts";
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
type Orientation = TrialOrientation;
type Vector2 = TrialVector;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const CHALAZA_VISUAL_EGG_WIDTH_RATIO = 0.46;
const CHALAZA_VISUAL_EGG_HEIGHT_RATIO = 0.68;
const ORACLE_SHAKE_ACTIVE_MAGNITUDE = 13;
const ORACLE_SHAKE_START_MAGNITUDE = 16;
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
  const ui = motionCopy[lang];
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
  const rootRef = useRef<HTMLElement | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const orientationBaseline = useRef<Orientation | null>(null);
  const sensorReceived = useRef(false);
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  const completionEpoch = useRef(0);
  const completedResult = useRef<MotionTrialResult | null>(null);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const chalazaState = useRef(new ChalazaSimulation());

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
    completionEpoch.current++;
    completedResult.current = null;
    setCompletionFailed(false); setSaving(false);
    clearTimers();
    modeRef.current = "ready";
    setMode("ready");
    setStatus(trialCopy.intro);
    setBaseline(null); orientationBaseline.current = null;
    setManualMode(false);
    manualModeRef.current = false;
    manualControl.current = { x: 0, y: 0 };
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    resetOracle();
  };

  const saveCompletion = async (result: MotionTrialResult) => {
    const epoch = ++completionEpoch.current;
    setSaving(true); setCompletionFailed(false);
    try {
      if (await completeRef.current?.(result) === false) throw new Error("Result was not saved");
      if (epoch === completionEpoch.current) setStatus(context === "fonin" ? trialCopy.foninSuccess : trialCopy.success);
    } catch {
      if (epoch === completionEpoch.current) { setCompletionFailed(true); setStatus(ui.common.completionError); }
    } finally { if (epoch === completionEpoch.current) setSaving(false); }
  };

  const finish = async (score: number, prediction?: string) => {
    clearTimers(); modeRef.current = "complete";
    setMode("complete");
    setBaseline(null); orientationBaseline.current = null;
    setManualMode(false); manualModeRef.current = false;
    const result = { kind, score: Math.round(clamp(score, 0, 100)), prediction };
    completedResult.current = result;
    setStatus(context === "fonin" ? trialCopy.foninSuccess : trialCopy.success);
    await saveCompletion(result);
  };

  useGameModal(rootRef, fullscreenActive, reset);
  useEffect(() => () => { completionEpoch.current++; }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);
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

      const score = oracleSensorScore(peaks);
      setShakePower(0);
      if (score !== null) {
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
      const angle = window.screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0);
      const next = trialOrientation(event, angle);
      if (!next) return;
      sensorReceived.current = true;
      latestOrientation.current = next;
      if (orientationBaseline.current && orientationBaseline.current.angle !== next.angle) {
        orientationBaseline.current = next;
      }
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
    let suspended = document.hidden;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const state = chalazaState.current;
      const neutral = orientationBaseline.current;
      const control = manualMode ? manualControl.current : neutral ? chalazaTilt(latestOrientation.current, neutral) : { x: 0, y: 0 };
      if (!suspended) state.advance(dt, control, manualMode);
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

      setEggOffset(nextOffset);
      setChalazaHoldMs(state.holdMs);

      if (state.rolledAway) {
        setChalazaRolledAway(true);
        setStatus(ui.chalaza.rolledAway);
        vibrate([140, 60, 220]);
        rollTimer.current = window.setTimeout(() => {
          setChalazaRolledAway(false);
          setEggOffset({ x: 0, y: 0 });
          chalazaState.current = new ChalazaSimulation();
          setChalazaHoldMs(0);
          setMode("ready");
          setStatus(ui.chalaza.retryAfterRoll);
        }, 1150);
        return;
      }
      if (state.completed) {
        void finish(94);
        return;
      }
      setStatus(
        state.centered
          ? state.correcting ? ui.chalaza.centered : ui.chalaza.needsCorrection
          : manualMode ? ui.chalaza.manualDrifting : ui.chalaza.drifting,
      );
      frame = requestAnimationFrame(tick);
    };
    const resetClock = () => { last = performance.now(); manualControl.current = { x: 0, y: 0 }; };
    const visibility = () => { suspended = document.hidden; resetClock(); };
    const blur = () => { suspended = true; resetClock(); };
    const focus = () => { suspended = document.hidden; resetClock(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur); window.addEventListener("focus", focus);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); };
  }, [kind, mode, baseline, manualMode, lang]);

  useEffect(() => {
    if (!manualMode || kind !== "chalaza" || mode !== "playing") return;
    const held = new Set<string>();
    const handleKey = (event: KeyboardEvent) => {
      if (!acceptsGameKey(event)) return;
      const controls: Record<string, Vector2> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      if (controls[event.code]) {
        event.preventDefault(); held.add(event.code);
        manualControl.current = { x: Number(held.has("ArrowRight")) - Number(held.has("ArrowLeft")), y: Number(held.has("ArrowDown")) - Number(held.has("ArrowUp")) };
      }
    };
    const stop = () => { held.clear(); manualControl.current = { x: 0, y: 0 }; };
    const release = (event: KeyboardEvent) => {
      held.delete(event.code);
      manualControl.current = { x: Number(held.has("ArrowRight")) - Number(held.has("ArrowLeft")), y: Number(held.has("ArrowDown")) - Number(held.has("ArrowUp")) };
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", stop);
    };
  }, [manualMode, kind, mode]);

  const calibrate = async () => {
    const epoch = ++completionEpoch.current;
    const allowed = await requestMotionPermission().catch(() => false);
    if (epoch !== completionEpoch.current) return;
    if (!allowed) {
      setStatus(ui.common.permissionDenied);
      return;
    }
    setMode("calibrating");
    sensorReceived.current = false;
    setStatus(ui.chalaza.calibrationStatus);
    calibrationTimer.current = window.setTimeout(() => {
      const current = latestOrientation.current;
      const unavailable = !sensorReceived.current;
      if (unavailable) {
        setMode("ready");
        setStatus(ui.chalaza.sensorUnavailable);
        return;
      }
      setBaseline(current); orientationBaseline.current = current;
      setMode("ready");
      setStatus(ui.chalaza.calibrated);
    }, 3000);
  };

  const startChalaza = (manual: boolean) => {
    if (!manual && !baseline) return;
    completionEpoch.current++;
    clearTimers();
    setManualMode(manual);
    manualModeRef.current = manual;
    manualControl.current = { x: 0, y: 0 };
    chalazaState.current = new ChalazaSimulation();
    setEggOffset({ x: 0, y: 0 });
    setChalazaHoldMs(0);
    setChalazaRolledAway(false);
    setMode("playing");
    setStatus(manual ? ui.chalaza.manualStatus : ui.chalaza.playing);
    vibrate(35);
  };

  const startOracle = async (manual: boolean) => {
    const epoch = ++completionEpoch.current;
    const allowed = manual || await requestMotionPermission().catch(() => false);
    if (epoch !== completionEpoch.current) return;
    if (!allowed) {
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
      ref={rootRef}
      role={fullscreenActive ? "dialog" : undefined}
      aria-modal={fullscreenActive || undefined}
      tabIndex={-1}
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
          onLostPointerCapture={() => setManualDirection({ x: 0, y: 0 })}
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
              onLostPointerCapture={() => setManualDirection({ x: 0, y: 0 })}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="motion-actions">
        {completionFailed && completedResult.current && <button type="button" disabled={saving} onClick={() => { if (completedResult.current) void saveCompletion(completedResult.current); }}>{ui.common.retrySave}</button>}
        {saving && <p role="status">{ui.common.saving}</p>}
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
