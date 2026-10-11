import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoadEngine } from "./engine.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import type { GyroState } from "./camera.ts";
import type { RoadSpec } from "./seed.ts";
import { dailyRoad, newRoadSeed, parseRoadCode } from "./seed.ts";
import { readTrackBest, saveTrackScore, saveRoadScore, readRoadProgress, saveRoadProgress, readSavedRoads, saveRoad, forgetRoad } from "./storage.ts";
import { RoadRecords, useRoadRecords } from "./RoadRecords.tsx";
import { RoadAccount, useRoadAccount } from "./RoadAccount.tsx";
import { beginPortalRun, submitPortalResult } from "../Portal/client.ts";
import ResultSync from "../Portal/ResultSync.tsx";
import { activeRoadAccount } from "./storage.ts";
import { RoadSession } from "./session.ts";
import { RoadHelp } from "./RoadHelp.tsx";
import { RoadSettings } from "./RoadSettings.tsx";
import { bestRoadResult, roadHistory, saveRoadResult } from "./results.ts";
import { flushRoadRecords } from "./recordSync.ts";
import type { SavedRoadRun } from "./results.ts";
import { defaultRoadPreferences, readRoadPreferences, saveRoadPreferences } from "./preferences.ts";
import type { RoadPreferences } from "./preferences.ts";
import { FLIGHT_LIMIT, JUMP_RECHARGE_SECONDS, ROAD_RULES_VERSION } from "./rules.ts";
import type { RoadFailure } from "./errors.ts";
import { FunRoads } from "./FunRoads.tsx";
import { funRoadCopy } from "./funRoads.ts";
import { PopularRoads } from "./PopularRoads.tsx";
import { emptyScore } from "./scoring.ts";
import type { BonusKind } from "./scoring.ts";
import { copy } from "./copy.ts";
import { useRoadFullscreen } from "./fullscreen.ts";
import { roadViewDelta, useRoadViewport } from "./viewport.ts";
import { Speedometer } from "./Speedometer.tsx";
import { useRoadOffline } from "./offline.ts";
import { RoadSteering } from "./controls.ts";
import "./EggRoad.css";

export type EggRoadLang = "ru" | "en";
const initialSnapshot: RoadSnapshot = {
  phase: "ready", score: 0, skipped: 0, bestSkip: 0, seconds: 0, finished: false,
  speed: 0, airborne: false, flightLeft: FLIGHT_LIMIT, progress: 0, lastSkip: 0,
  level: 1, boost: 0, rhythmSpeedBonus: 0, rhythm: 0, mode: "levels", gates: 0, breakdown: emptyScore(),
  rhythmCue: { state: "start", progress: 0 }, jumpAvailable: true, jumpCooldown: 0, jumpRecharging: false, code: "EGG1-R-1-0", distance: 0, bonus: null, activeBonuses: [],
};

export default function EggRoad({ lang, onClose, onComplete, publicPage = false }: {
  lang: EggRoadLang; onClose: () => void; onComplete?: (result: RoadResult) => void; publicPage?: boolean;
}) {
  const ui = copy[lang];
  const offlineReady = useRoadOffline(lang);
  const canvasHost = useRef<HTMLDivElement>(null), modal = useRef<HTMLDivElement>(null);
  const engine = useRef<RoadEngine | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [menu, setMenu] = useState(true);
  const fullscreen = useRoadFullscreen(modal, () => engine.current?.pause());
  const view = useRoadViewport(modal, fullscreen.mobile && !menu && ["running", "intro", "overview"].includes(snapshot.phase) ? fullscreen.orientation : null);
  const viewRef = useRef(view); viewRef.current = view;
  const heldPointers = useRef(new RoadSteering());
  const lookPointer = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);
  const mapPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  const session = useRef(new RoadSession(() => beginPortalRun("road", (selected.current?.version ?? 1) >= 2 ? 2 : 1)));
  const [completedRun, setCompletedRun] = useState<SavedRoadRun | null>(null);
  const [publishRun, setPublishRun] = useState<SavedRoadRun | null>(null);
  const [history, setHistory] = useState<SavedRoadRun[]>([]);
  const [durable, setDurable] = useState(true);
  const [preferences, setPreferences] = useState(defaultRoadPreferences);
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const [loadEpoch, setLoadEpoch] = useState(0);
  const selected = useRef<RoadSpec | null>(null);
  const [online, setOnline] = useState(true);
  const board = useRoadRecords(snapshot.code, publishRun);
  const account = useRoadAccount(board);
  const [ready, setReady] = useState(false), [error, setError] = useState<RoadFailure | null>(null);
  const [menuTab, setMenuTab] = useState<"modes" | "popular">("modes");
  const mutedRef = useRef(true);
  const landingGuideRef = useRef(false);
  const [best, setBest] = useState(0), [newBest, setNewBest] = useState(false);
  const [pressed, setPressed] = useState(0), [gyro, setGyro] = useState<GyroState>("off");
  const [calibrated, setCalibrated] = useState(false);
  const [seedInput, setSeedInput] = useState(""), [seedError, setSeedError] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [progress, setProgress] = useState(readRoadProgress);
  const [shareMessage, setShareMessage] = useState(""), [shareValue, setShareValue] = useState<string | null>(null);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReady(false); setError(null);
    const previousOverflow = document.body.style.overflow;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const previousViewport = viewport?.content;
    if (viewport) viewport.content = `${viewport.content.replace(/,?\s*viewport-fit=[^,]+/, "")}, viewport-fit=cover`;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden"; modal.current?.focus();
    setBest(readTrackBest(initialSnapshot.code)); setSaved(readSavedRoads()); setProgress(readRoadProgress());
    const settings = readRoadPreferences(); setPreferences(settings); preferencesRef.current = settings;
    mutedRef.current = settings.muted;
    landingGuideRef.current = settings.landingGuide;
    const shared = new URL(window.location.href).searchParams.get("road");
    const sharedSpec = shared ? parseRoadCode(shared) : null;
    const progress = readRoadProgress();
    selected.current ??= sharedSpec ?? { mode: "levels", ...progress, version: ROAD_RULES_VERSION };
    if (shared && !sharedSpec) { setSeedInput(shared.slice(0, 2048)); setSeedError(true); }
    if (sharedSpec) setMenu(false);
    const abort = new AbortController(); let instance: RoadEngine | null = null;
    void import("./engine.ts").then(({ createRoadEngine }) => {
      if (abort.signal.aborted || !canvasHost.current) return null;
      return createRoadEngine(canvasHost.current, {
        update: next => { selected.current = { ...parseRoadCode(next.code)!, mode: next.mode }; setSnapshot(next); }, gyro: setGyro, failure: setError, menu: setMenu, busy: busy => setReady(!busy),
        start: () => { const ticket = session.current.start(); setCompletedRun(null); setNewBest(false); return ticket.owner; },
        complete: (result, checkpoint) => {
          const ticket = session.current.finish(); if (!ticket) return;
          const owner = ticket.owner;
          const savedResult = saveRoadResult(ticket, result); setCompletedRun(savedResult.run); setDurable(savedResult.durable);
          setPublishRun(bestRoadResult(result.code)); setHistory(roadHistory());
          void flushRoadRecords();
          if (checkpoint) saveRoadProgress(checkpoint, owner);
          setNewBest(owner === activeRoadAccount() && result.score > readTrackBest(result.code, owner));
          saveTrackScore(result.code, result.score, owner); setBest(readTrackBest(result.code));
          saveRoadScore(result.code.startsWith("EGG1-") ? result.mode : `${result.mode}-v${parseRoadCode(result.code)?.version ?? 1}`, result.score, owner); setProgress(readRoadProgress());
          submitPortalResult(ticket, { score: String(result.score), peak: String(result.score), seconds: result.seconds, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0 });
          completeRef.current?.(result);
        },
      }, abort.signal, selected.current!);
    }).then(created => {
      if (!created) return;
      if (abort.signal.aborted) { created.dispose(); return; }
      instance = created; engine.current = created; created.setMuted(mutedRef.current);
      created.setLandingGuide(landingGuideRef.current); created.setHaptics(preferencesRef.current.haptics); created.setQuality(preferencesRef.current.quality); created.setGhost(preferencesRef.current.ghost); setReady(true);
      created.setViewRotation(viewRef.current.rotation);
    }).catch(argumentsError => { if (!abort.signal.aborted) setError((argumentsError as { code?: RoadFailure })?.code ?? "load"); });
    return () => { abort.abort(); instance?.dispose(); engine.current = null; document.body.style.overflow = previousOverflow; if (viewport && previousViewport !== undefined) viewport.content = previousViewport; previousFocus?.focus(); };
  }, [loadEpoch]);

  useEffect(() => {
    modal.current?.focus();
    if (snapshot.phase !== "running" || menu) {
      heldPointers.current.clear(); lookPointer.current = null; setPressed(0);
      engine.current?.steer(0);
    }
    mapPointer.current = null;
  }, [snapshot.phase, menu]);
  useEffect(() => { setBest(readTrackBest(snapshot.code)); setShareMessage(""); setShareValue(null); }, [snapshot.code]);
  useEffect(() => {
    if (!board.data || board.data.code !== snapshot.code) return;
    setBest(readTrackBest(snapshot.code));
    const boardOwner = board.data.registered ? board.data.name.normalize("NFKC").toLowerCase() : null;
    if (boardOwner !== activeRoadAccount()) return;
    if (board.data.personal) setBest(saveTrackScore(snapshot.code, board.data.personal.score));
    saveRoadScore(snapshot.code.startsWith("EGG1-") ? "endless" : `endless-v${parseRoadCode(snapshot.code)?.version ?? 1}`, board.data.endlessBest);
  }, [board.data, snapshot.code]);
  useEffect(() => {
    setBest(readTrackBest(snapshot.code)); setPublishRun(bestRoadResult(snapshot.code));
    setHistory(roadHistory()); setSaved(readSavedRoads()); setProgress(readRoadProgress());
  }, [account.profile?.name, account.profile?.registered, snapshot.code]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => { if (calibrated) { const timer = setTimeout(() => setCalibrated(false), 1800); return () => clearTimeout(timer); } }, [calibrated]);
  useEffect(() => {
    heldPointers.current.clear(); lookPointer.current = mapPointer.current = null; setPressed(0);
    engine.current?.steer(0); engine.current?.setViewRotation(view.rotation);
  }, [view.width, view.height, view.rotation]);

  const choose = (spec: RoadSpec) => {
    selected.current = spec;
    void engine.current?.selectRoad(spec).then(ok => { if (ok) {
      setCompletedRun(null); setNewBest(false); setShareMessage(""); setShareValue(null);
      requestAnimationFrame(() => {
        modal.current?.querySelector(".egg-road-overlay")?.scrollTo({ top: 0 });
        modal.current?.querySelector<HTMLButtonElement>(".egg-road-primary")?.focus({ preventScroll: true });
      });
    } });
  };
  const loadSeed = (value: string) => { const spec = parseRoadCode(value); setSeedError(!spec); if (spec) choose(spec); };
  const showModes = () => { engine.current?.openMenu(); setProgress(readRoadProgress()); setMenu(true); };
  const updateSteering = () => {
    const steering = heldPointers.current.value;
    engine.current?.steer(steering); setPressed(Math.round(steering * 20) / 20);
  };
  const pointerSide = (x: number, y: number): -1 | 1 => {
    const bounds = modal.current!.getBoundingClientRect();
    return roadViewDelta(x - bounds.left - bounds.width / 2, y - bounds.top - bounds.height / 2, view.rotation).x < 0 ? -1 : 1;
  };
  const updatePreferences = (patch: Partial<RoadPreferences>) => {
    const next = { ...preferencesRef.current, ...patch }; preferencesRef.current = next;
    setPreferences(next); saveRoadPreferences(next);
    mutedRef.current = next.muted; engine.current?.setMuted(next.muted);
    landingGuideRef.current = next.landingGuide; engine.current?.setLandingGuide(next.landingGuide);
    engine.current?.setQuality(next.quality); engine.current?.setHaptics(next.haptics); engine.current?.setGhost(next.ghost);
  };
  const copySeed = async (link = false) => {
    const url = new URL(`/${lang}/play/`, window.location.origin); url.searchParams.set("road", snapshot.code);
    const value = link ? url.toString() : snapshot.code;
    try { await navigator.clipboard.writeText(value); setShareMessage(ui.copied); }
    catch { setShareValue(value); setShareMessage(ui.copyManually); requestAnimationFrame(() => { codeField.current?.focus(); codeField.current?.select(); }); }
  };
  const remember = () => { if (saveRoad(snapshot.code)) { setSaved(readSavedRoads()); setShareMessage(ui.savedOne); } else setShareMessage(ui.storageError); };
  const calibrate = () => { if (engine.current?.calibrateGyro()) setCalibrated(true); };
  const play = () => { fullscreen.enterForPlay(); engine.current?.play(); };
  const ended = snapshot.phase === "over" || snapshot.phase === "finished";
  const flyingIn = snapshot.phase === "intro", overview = snapshot.phase === "overview";
  const showPanel = menu || !ready || error || (snapshot.phase !== "running" && !flyingIn && !overview);
  const stopLooking = () => { lookPointer.current = null; };
  const funCopy = funRoadCopy({ mode: snapshot.mode, seed: parseRoadCode(snapshot.code)?.seed ?? 0 }, lang);
  const modeLabel = funCopy?.title ?? (snapshot.mode === "straight" ? ui.straight : snapshot.mode === "endless" ? ui.endless : snapshot.level === 1 ? ui.tutorial : `${ui.level} ${snapshot.level}`);
  const cue = snapshot.rhythmCue;
  const failureText = error ? ({ load: ui.failureLoad, physics: ui.failurePhysics, track: ui.failureTrack, graphics: ui.failureGraphics, context: ui.failureContext, runtime: ui.failureRuntime } as const)[error] : "";
  const lesson = snapshot.distance < 55 ? ui.lessonSteer : snapshot.distance < 125 ? ui.lessonJump : snapshot.distance < 240 ? ui.lessonShortcut : ui.lessonFinish;
  const legacyProgress = readRoadProgress(null);
  const resumeFromMenu = menu && snapshot.phase === "paused";
  const canAct = !menu || resumeFromMenu;
  const primaryLabel = !ready ? ui.loading : resumeFromMenu || snapshot.phase === "paused" ? ui.resume : snapshot.finished && snapshot.mode === "levels" ? ui.next : ended ? ui.retry : ui.start;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="egg-road" data-panel={showPanel} data-left-handed={preferences.leftHanded} role="dialog" aria-modal="true" aria-label={ui.title} tabIndex={-1} ref={modal}
      onKeyDown={event => {
        if (!event.defaultPrevented && event.code === "KeyF" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target as HTMLElement).closest("input, textarea, select, button, a, summary, [contenteditable='true']")) {
          event.preventDefault(); void fullscreen.toggle(); return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...(modal.current?.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']),input:not([disabled]),summary,a[href]") ?? [])].filter(el => el.offsetParent !== null);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="egg-road-viewport" data-rotation={view.rotation} data-orientation={fullscreen.mobile ? fullscreen.orientation : "auto"}
        style={{ width: view.width, height: view.height, transform: `translate(-50%, -50%) rotate(${view.rotation}deg)` }}>
      <div className="egg-road-scene" ref={canvasHost} />
      <div className="egg-road-vignette" aria-hidden="true" />
      <header className="egg-road-hud">
        <button className="egg-road-icon egg-road-exit" type="button" onClick={menu ? onClose : showModes} aria-label={menu ? publicPage ? ui.publicClose : ui.close : ui.modes}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
        </button>
        <div className="egg-road-score" style={{ visibility: showPanel || overview ? "hidden" : "visible" }}>
          <span>{ui.title}</span><strong>{String(snapshot.score).padStart(2, "0")}</strong>
          <small>{ui.score} · {ui.best} {best}</small><span className="egg-road-level">{modeLabel}</span>
          {!showPanel && !flyingIn && !overview && <div className="egg-road-notices">
            {snapshot.airborne ? <div className="egg-road-flight"><span className="egg-road-sr-only" role="status">{ui.air}</span><span>{ui.air}</span><strong>{snapshot.flightLeft.toFixed(1)}</strong><div><i style={{ transform: `scaleX(${snapshot.flightLeft / FLIGHT_LIMIT})` }} /></div></div>
              : snapshot.bonus ? <div className="egg-road-shortcut" role="status">{snapshot.bonus.parts?.map(part => `${ui.bonusNames[part.kind]} +${part.points}`).join(" · ") ?? ui.bonusNames[snapshot.bonus.kind]} <b>+{snapshot.bonus.points}</b></div> : null}
          </div>}
        </div>
        <div className="egg-road-hud-actions">
        {fullscreen.mobile && <button className="egg-road-icon egg-road-orientation" type="button" onClick={fullscreen.toggleOrientation}
          aria-label={fullscreen.orientation === "landscape" ? ui.portrait : ui.landscape} title={fullscreen.orientation === "landscape" ? ui.portrait : ui.landscape}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x={fullscreen.orientation === "landscape" ? 7 : 4} y={fullscreen.orientation === "landscape" ? 4 : 7} width={fullscreen.orientation === "landscape" ? 10 : 16} height={fullscreen.orientation === "landscape" ? 16 : 10} rx="2" /><path d="M3 9V4h5m13 11v5h-5" /></svg>
        </button>}
        {!fullscreen.standalone && <button className="egg-road-icon egg-road-fullscreen" type="button" onClick={() => void fullscreen.toggle()} disabled={fullscreen.pending} aria-label={fullscreen.active ? ui.fullscreenExit : ui.fullscreenEnter} title={fullscreen.active ? ui.fullscreenExit : ui.fullscreenEnter} aria-pressed={fullscreen.active}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={fullscreen.active ? "M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5" : "M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"} /></svg>
        </button>}
        <button className="egg-road-icon" type="button" onClick={() => engine.current?.pause()} disabled={!ready || menu || !["running", "intro", "overview"].includes(snapshot.phase)} aria-label={ui.pause}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
        </button>
        </div>
      </header>
      {!showPanel && !flyingIn && !overview && <>
        {snapshot.level === 1 && !snapshot.code.startsWith("EGG1-") && <p className="egg-road-lesson" role="status">{lesson}</p>}
        {([-1, 1] as const).map(direction => <button key={direction} type="button" tabIndex={-1}
          className={`egg-road-steer ${direction < 0 ? "is-left" : "is-right"} ${pressed * direction > 0 ? "is-held" : ""}`}
          data-strength={Math.max(0, pressed * direction)}
          aria-label={direction < 0 ? ui.left : ui.right}
          onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); heldPointers.current.begin(event.pointerId, direction); updateSteering(); }}
          onPointerMove={event => { if (heldPointers.current.move(event.pointerId, pointerSide(event.clientX, event.clientY))) updateSteering(); }}
          onPointerUp={event => { heldPointers.current.end(event.pointerId); updateSteering(); }}
          onPointerCancel={event => { heldPointers.current.end(event.pointerId); updateSteering(); }}
          onLostPointerCapture={event => { heldPointers.current.end(event.pointerId); updateSteering(); }}>
          <span aria-hidden="true">{direction < 0 ? "‹" : "›"}<svg className="egg-road-steer-power" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" pathLength="1" strokeDasharray={`${Math.max(0, pressed * direction)} 1`} /></svg></span>
        </button>)}
        <button className={`egg-road-jump ${snapshot.jumpRecharging ? "is-recharging" : ""}`} type="button" disabled={!snapshot.jumpAvailable}
          aria-label={snapshot.jumpAvailable ? ui.jumpHelp : `${ui.jumpRecharge} ${snapshot.jumpCooldown.toFixed(1)} ${ui.secondsShort}. ${snapshot.jumpRecharging ? ui.jumpRolling : ui.jumpPaused}`}
          onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); engine.current?.jump(); }} onClick={event => { if (event.detail === 0) engine.current?.jump(); }}>
          <span aria-hidden="true">↑<b>{snapshot.jumpAvailable ? 1 : snapshot.jumpCooldown.toFixed(1)}</b></span><small>{snapshot.jumpAvailable ? ui.jump : snapshot.jumpRecharging ? ui.jumpRolling : ui.jumpPaused}</small>
          {!snapshot.jumpAvailable && <svg className="egg-road-jump-charge" viewBox="0 0 58 64" preserveAspectRatio="none" aria-hidden="true"><rect x="2" y="2" width="54" height="60" rx="20" pathLength="1" strokeDasharray={`${1 - snapshot.jumpCooldown / JUMP_RECHARGE_SECONDS} 1`} /></svg>}
        </button>
        <button className="egg-road-look" type="button" tabIndex={-1} aria-label={ui.lookDrag}
          onPointerDown={event => { if (lookPointer.current || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 }; }}
          onPointerMove={event => { const pointer = lookPointer.current; if (pointer?.id !== event.pointerId) return; const delta = roadViewDelta(event.clientX - pointer.x, event.clientY - pointer.y, view.rotation); pointer.moved += Math.hypot(delta.x, delta.y); engine.current?.lookAround(delta.x, delta.y); pointer.x = event.clientX; pointer.y = event.clientY; }}
          onPointerUp={event => { const pointer = lookPointer.current; if (pointer?.id !== event.pointerId) return; if (pointer.moved < 6) engine.current?.centerLook(); stopLooking(); }}
          onPointerCancel={event => { if (lookPointer.current?.id === event.pointerId) stopLooking(); }} onLostPointerCapture={event => { if (lookPointer.current?.id === event.pointerId) stopLooking(); }} onClick={event => { if (event.detail === 0) engine.current?.centerLook(); }}>
          <span aria-hidden="true">◎</span><small>{ui.lookForward}</small>
        </button>
        {gyro === "on" && <button className="egg-road-calibrate" type="button" onClick={calibrate} aria-label={ui.calibrate}>{calibrated ? "✓" : ui.calibrateShort}</button>}
        <div className={`egg-road-instruments ${snapshot.boost > .1 ? "is-charged" : ""}`}>
          <Speedometer speed={snapshot.speed} unit={ui.speedUnit} maximum={Math.max(snapshot.code === "EGG3-T-8-5" ? 400 : 160, Math.ceil(snapshot.speed * 3.6 / 80) * 80)} />
          <div className="egg-road-rhythm">
            <span>{ui.rhythm} ×{snapshot.rhythm}{cue.state === "air" ? " ⏸" : ""}</span>
            <div className="egg-road-charge"><i style={{ transform: `scaleX(${cue.progress})` }} /></div>
            <small>{cue.state === "air" ? ui.rhythmAir : snapshot.boost > .1 ? `+${Math.round(snapshot.rhythmSpeedBonus * 3.6)} ${ui.speedUnit}` : ui.rhythmStart}</small>
          </div>
        </div>
        <div className="egg-road-active-bonuses">{snapshot.activeBonuses.map(kind => <span key={kind}>{ui.bonusNames[kind]} +</span>)}</div>
        <div className="egg-road-key-hint">{ui.keyboard}</div>
      </>}
      {!showPanel && overview && <div className="egg-road-map-orbit" role="group" tabIndex={0} aria-label={ui.overviewDrag}
        onPointerDown={event => { if (mapPointer.current || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); mapPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; engine.current?.grabOverview(); }}
        onPointerMove={event => { const pointer = mapPointer.current; if (pointer?.id !== event.pointerId) return; const delta = roadViewDelta(event.clientX - pointer.x, event.clientY - pointer.y, view.rotation); engine.current?.rotateOverview(delta.x, delta.y); pointer.x = event.clientX; pointer.y = event.clientY; }}
        onPointerUp={event => { if (mapPointer.current?.id === event.pointerId) mapPointer.current = null; }}
        onPointerCancel={event => { if (mapPointer.current?.id === event.pointerId) mapPointer.current = null; }}
        onLostPointerCapture={event => { if (mapPointer.current?.id === event.pointerId) mapPointer.current = null; }} />}
      {!showPanel && (flyingIn || overview) && <div className={`egg-road-flyby ${overview ? "is-overview" : ""}`}>
        <p>{snapshot.mode === "endless" ? ui.endlessView : ui.flyby}</p>
        {overview && <p className="egg-road-map-hint">{ui.overviewDrag}</p>}
        <div className="egg-road-flyby-actions"><button type="button" onClick={overview ? play : () => engine.current?.skipFlyby()}>{overview ? ui.overviewStart : ui.skipFlyby} <span aria-hidden="true">↗</span></button>
        {overview && <button className="egg-road-map-reset" type="button" onClick={() => engine.current?.resetOverview()}>{ui.overviewReset}</button>}</div>
      </div>}
      {showPanel && <div className="egg-road-overlay"><section className={`egg-road-panel ${menu ? "egg-road-menu" : ""}`}>
        <p className="egg-road-kicker">{menu ? ui.modes : modeLabel}</p>
        <h1>{error ? ui.error : menu ? ui.title : snapshot.phase === "paused" ? ui.paused : ended ? snapshot.finished ? ui.finished : ui.over : ui.title}</h1>
        {error ? <><p role="alert">{failureText}</p><button className="egg-road-primary" onClick={() => { if (error === "load") location.reload(); else setLoadEpoch(value => value + 1); }}>{ui.reload}</button></>
          : canAct && <div className="egg-road-primary-row">
            <button className="egg-road-primary" type="button" disabled={!ready} onClick={play}>{primaryLabel}<span aria-hidden="true">↗</span></button>
            {!menu && <button className="egg-road-change-mode" type="button" onClick={showModes}>{ui.changeMode}<span aria-hidden="true">↩</span></button>}
          </div>}
        {!online && <p className="egg-road-status" role="status">{ui.offline}</p>}
        {fullscreen.notice && <div className="egg-road-fullscreen-note" role="status"><p>{fullscreen.notice === "install" ? ui.fullscreenInstall : ui.fullscreenUnavailable}</p>{fullscreen.notice === "install" && !publicPage && <a href={`/${lang}/play/?road=${snapshot.code}`}>{ui.fullscreenGamePage}</a>}</div>}
        {menu && !error ? <>
          <div className="egg-road-tabs" role="tablist" aria-label={ui.menuTabs}>
            {([ ["modes", ui.modeTab], ["popular", ui.popularTab] ] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" id={`egg-road-tab-${tab}`} aria-controls={`egg-road-panel-${tab}`} aria-selected={menuTab === tab} tabIndex={menuTab === tab ? 0 : -1} onClick={() => setMenuTab(tab)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "modes" : event.key === "End" ? "popular" : tab === "modes" ? "popular" : "modes";
              setMenuTab(next); document.getElementById(`egg-road-tab-${next}`)?.focus();
            }}>{label}</button>)}
          </div>
          <div role="tabpanel" id={`egg-road-panel-${menuTab}`} aria-labelledby={`egg-road-tab-${menuTab}`}>
          {menuTab === "popular" ? <PopularRoads lang={lang} ready={ready} onChoose={loadSeed} /> : <>
          <p className="egg-road-intro">{ui.choose}</p>
          <div className="egg-road-mode-grid">
            <button disabled={!ready} onClick={() => choose({ mode: "practice", level: 1, seed: 0, version: ROAD_RULES_VERSION })}><strong>{ui.tutorial}</strong><small>{ui.practiceHint}</small></button>
            <button disabled={!ready} onClick={() => choose({ mode: "levels", ...progress, version: ROAD_RULES_VERSION })}><strong>{ui.levels}</strong><small>{ui.levelsHint} {progress.level}</small></button>
            <button disabled={!ready} onClick={() => choose({ mode: "endless", level: 2, seed: newRoadSeed(), version: ROAD_RULES_VERSION })}><strong>∞ {ui.endless}</strong><small>{ui.endlessHint}</small></button>
            <button disabled={!ready} onClick={() => choose(dailyRoad())}><strong>{ui.daily}</strong><small>{ui.dailyHint}</small></button>
          </div>
          {account.profile?.registered && legacyProgress.level > progress.level && <button className="egg-road-overview" disabled={!ready} onClick={() => choose({ mode: "levels", ...legacyProgress })}>{ui.legacyProgress} · {ui.level} {legacyProgress.level}</button>}
          {!ready && <p role="status">{ui.loading}</p>}
          <form className="egg-road-seed-form" onSubmit={event => { event.preventDefault(); loadSeed(seedInput); }}>
            <label htmlFor="egg-road-seed">{ui.seedHint}</label>
            <div><input id="egg-road-seed" value={seedInput} maxLength={2048} placeholder="EGG3-R-2-ABC" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-invalid={seedError} aria-describedby={seedError ? "egg-road-seed-error" : undefined} onChange={event => { setSeedInput(event.target.value); setSeedError(false); }} /><button disabled={!ready || !seedInput.trim()}>{ui.openSeed}</button></div>
            {seedError && <p id="egg-road-seed-error" role="alert">{ui.seedError}</p>}
          </form>
          {saved.length > 0 && <details className="egg-road-help"><summary>{ui.saved} · {saved.length}</summary><ul className="egg-road-saved">{saved.map(code => <li key={code}><button onClick={() => loadSeed(code)}>{code}</button><button aria-label={`${ui.remove} ${code}`} onClick={() => { if (forgetRoad(code)) setSaved(readSavedRoads()); }}>{ui.remove}</button></li>)}</ul></details>}
          </>}
          </div>
        </> : !error ? <>
          <p className="egg-road-intro">{error ? failureText : snapshot.phase === "paused" ? ui.pausedText : ended ? snapshot.finished ? snapshot.mode === "levels" ? ui.finishedText : ui.seedFinished : snapshot.endReason === "flight" ? ui.flightEnd : snapshot.endReason === "below" ? ui.belowEnd : ui.overText : funCopy?.hint ?? ui.intro}</p>
          {ended && <><div className="egg-road-result"><strong>{snapshot.score}<span>{ui.score}</span></strong><dl><div><dt>{ui.gates}</dt><dd>{snapshot.gates}</dd></div><div><dt>{ui.distance}</dt><dd>{Math.floor(snapshot.distance)}</dd></div><div><dt>{ui.bestSkip}</dt><dd>{snapshot.bestSkip}</dd></div></dl></div></>}
          {!error && <>
            {snapshot.phase === "ready" && <p className="egg-road-rhythm-intro">{ui.quickControls}</p>}
            {ready && snapshot.phase !== "paused" && <button className="egg-road-overview" type="button" onClick={() => { fullscreen.enterForPlay(); setNewBest(false); engine.current?.overview(); }}>{ui.overview} ◎</button>}
            {ended && completedRun && <><ResultSync lang={lang} owner={completedRun.owner} quiet />{!durable && <p role="status">{ui.sessionOnly}</p>}</>}
            {ready && <RoadRecords lang={lang} board={board} result={publishRun?.result ?? null} best={best} currentScore={ended ? snapshot.score : null} newBest={newBest} />}
            {ready && <div className="egg-road-map-code"><label htmlFor="egg-road-code">{ui.code}</label><input id="egg-road-code" ref={codeField} readOnly value={shareValue ?? snapshot.code} onClick={event => event.currentTarget.select()} /><div><button onClick={() => void copySeed()}>{ui.copyCode}</button><button onClick={() => void copySeed(true)}>{ui.copyLink}</button><button disabled={saved.includes(snapshot.code)} onClick={remember}>{saved.includes(snapshot.code) ? ui.savedOne : ui.save}</button></div>{shareMessage && <p role="status">{shareMessage}</p>}</div>}
            {ended && <details className="egg-road-help"><summary>{ui.scoreBreakdown}</summary><dl className="egg-road-breakdown"><div><dt>{ui.maxSpeed}</dt><dd>{Math.round((snapshot.maxSpeed ?? 0) * 3.6)} {ui.speedUnit}</dd></div><div><dt>{ui.bestRhythm}</dt><dd>{snapshot.bestRhythm ?? 0}</dd></div><div><dt>{ui.jumpsUsed}</dt><dd>{snapshot.jumps ?? 0}</dd></div><div><dt>{ui.skipped}</dt><dd>{snapshot.skipped}</dd></div>{(Object.keys(snapshot.breakdown) as BonusKind[]).filter(kind => snapshot.breakdown[kind] > 0).map(kind => <div key={kind}><dt>{ui.bonusNames[kind]}</dt><dd>+{snapshot.breakdown[kind]}</dd></div>)}</dl></details>}
            <RoadHelp lang={lang} version={parseRoadCode(snapshot.code)?.version ?? 1} />
          </>}
        </> : null}
        {!error && <RoadAccount lang={lang} account={account} reload={board.reload} failed={board.failed} suggestedName={board.name} />}
        {!error && history.length > 0 && <details className="egg-road-help"><summary>{ui.history}</summary><ul className="egg-road-saved">{history.slice(0, 12).map(run => <li key={run.id}><button disabled={!ready} onClick={() => loadSeed(run.result.code)}>{run.result.code}</button><span>{run.result.score}</span></li>)}</ul></details>}
        {!error && ready && <RoadSettings lang={lang} preferences={preferences} onPreferences={updatePreferences}
          mobile={fullscreen.mobile} orientation={fullscreen.orientation} onOrientation={fullscreen.toggleOrientation}
          gyro={gyro} onGyro={() => engine.current?.toggleGyro()} calibrated={calibrated} onCalibrate={calibrate} />}
        {!error && <FunRoads lang={lang} ready={ready} onChoose={choose} completed={[
          ...history.filter(run => run.owner === activeRoadAccount() && run.result.finished).map(run => run.result.code),
          ...(board.data && (board.data.registered ? board.data.name.normalize("NFKC").toLowerCase() : null) === activeRoadAccount() ? board.data.completedRoads ?? [] : []),
        ]} />}
        {(menu || error) && <div className="egg-road-panel-footer"><button type="button" onClick={menu ? onClose : showModes}>{menu ? publicPage ? ui.publicClose : ui.close : ui.modes}</button></div>}
        {menu && online && offlineReady && <p className="egg-road-status">{ui.offlineReady}</p>}
        {publicPage && menu && <p className="egg-road-adepts">{ui.moreGames} <a href={`/${lang}/quiz/`}>{ui.initiation}</a></p>}
      </section></div>}
      {snapshot.mode !== "endless" && <div className="egg-road-progress" aria-hidden="true"><i style={{ transform: `scaleX(${snapshot.progress})` }} /></div>}
      </div>
    </div>, document.body,
  );
}
