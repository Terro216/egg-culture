import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RoadEngine } from "./engine.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import type { GyroState } from "./camera.ts";
import type { RoadSpec } from "./seed.ts";
import { newRoadSeed, parseRoadCode } from "./seed.ts";
import { readTrackBest, saveTrackScore, saveRoadScore, readRoadProgress, readSavedRoads, saveRoad, forgetRoad, ROAD_STORAGE_KEY } from "./storage.ts";
import { RoadRecords, useRoadRecords } from "./RoadRecords.tsx";
import { RoadAccount, useRoadAccount } from "./RoadAccount.tsx";
import { selectRoadAccount } from "./storage.ts";
import { PopularRoads } from "./PopularRoads.tsx";
import { emptyScore } from "./scoring.ts";
import type { BonusKind } from "./scoring.ts";
import { copy } from "./copy.ts";
import { useRoadFullscreen } from "./fullscreen.ts";
import "./EggRoad.css";

export type EggRoadLang = "ru" | "en";
const initialSnapshot: RoadSnapshot = {
  phase: "ready", score: 0, skipped: 0, bestSkip: 0, seconds: 0, finished: false,
  speed: 0, airborne: false, flightLeft: 4.2, progress: 0, lastSkip: 0,
  level: 1, boost: 0, rhythm: 0, mode: "levels", gates: 0, breakdown: emptyScore(),
  rhythmCue: { state: "start", direction: 0, progress: 0 }, code: "EGG1-R-1-0", distance: 0, bonus: null, activeBonuses: [],
};

export default function EggRoad({ lang, onClose, onComplete, publicPage = false }: {
  lang: EggRoadLang; onClose: () => void; onComplete?: (result: RoadResult) => void; publicPage?: boolean;
}) {
  const ui = copy[lang];
  const canvasHost = useRef<HTMLDivElement>(null), modal = useRef<HTMLDivElement>(null);
  const engine = useRef<RoadEngine | null>(null);
  const fullscreen = useRoadFullscreen(modal, () => engine.current?.pause());
  const heldPointers = useRef(new Map<number, number>());
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [result, setResult] = useState<RoadResult | null>(null);
  const board = useRoadRecords(snapshot.code, result);
  const account = useRoadAccount(board);
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const [menu, setMenu] = useState(true);
  const [menuTab, setMenuTab] = useState<"modes" | "popular">("modes");
  const [muted, setMuted] = useState(true); const mutedRef = useRef(true);
  const [best, setBest] = useState(0), [newBest, setNewBest] = useState(false);
  const [pressed, setPressed] = useState(0), [gyro, setGyro] = useState<GyroState>("off");
  const [calibrated, setCalibrated] = useState(false);
  const [seedInput, setSeedInput] = useState(""), [seedError, setSeedError] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [progress, setProgress] = useState({ level: 1, seed: 0 });
  const [shareMessage, setShareMessage] = useState(""), [shareValue, setShareValue] = useState<string | null>(null);
  const seedField = useRef<HTMLInputElement>(null), codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const previousViewport = viewport?.content;
    if (viewport) viewport.content = `${viewport.content.replace(/,?\s*viewport-fit=[^,]+/, "")}, viewport-fit=cover`;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden"; modal.current?.focus();
    setBest(readTrackBest(initialSnapshot.code)); setSaved(readSavedRoads()); setProgress(readRoadProgress());
    try { mutedRef.current = JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "null")?.muted !== false; setMuted(mutedRef.current); } catch { /* Optional storage. */ }
    const abort = new AbortController(); let instance: RoadEngine | null = null;
    void import("./engine.ts").then(({ createRoadEngine }) => {
      if (abort.signal.aborted || !canvasHost.current) return null;
      return createRoadEngine(canvasHost.current, {
        update: setSnapshot, gyro: setGyro, failure: () => setError(true),
        complete: result => {
          setResult(result); setNewBest(result.score > readTrackBest(result.code));
          setBest(saveTrackScore(result.code, result.score)); saveRoadScore(result.mode, result.score); setProgress(readRoadProgress());
          completeRef.current?.(result);
        },
      }, abort.signal);
    }).then(created => {
      if (!created) return;
      if (abort.signal.aborted) { created.dispose(); return; }
      instance = created; engine.current = created; created.setMuted(mutedRef.current); setReady(true);
      const shared = new URL(window.location.href).searchParams.get("road");
      if (shared) {
        const spec = parseRoadCode(shared);
        if (spec) { created.selectRoad(spec); setMenu(false); }
        else { setSeedInput(shared.slice(0, 2048)); setSeedError(true); }
      }
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => { abort.abort(); instance?.dispose(); engine.current = null; document.body.style.overflow = previousOverflow; if (viewport && previousViewport !== undefined) viewport.content = previousViewport; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    modal.current?.focus();
    if (snapshot.phase !== "running" || menu) {
      heldPointers.current.clear(); lookPointer.current = null; setPressed(0);
      engine.current?.steer(0); engine.current?.lookAround(0, 0);
    }
  }, [snapshot.phase, menu]);
  useEffect(() => { setBest(readTrackBest(snapshot.code)); setShareMessage(""); setShareValue(null); }, [snapshot.code]);
  useEffect(() => {
    if (!board.data || board.data.code !== snapshot.code) return;
    selectRoadAccount(board.data.registered ? board.data.name : null);
    setBest(readTrackBest(snapshot.code));
    if (board.data.personal) setBest(saveTrackScore(snapshot.code, board.data.personal.score));
    saveRoadScore("endless", board.data.endlessBest);
  }, [board.data, snapshot.code]);
  useEffect(() => { setBest(readTrackBest(snapshot.code)); }, [account.profile, snapshot.code]);
  useEffect(() => { if (calibrated) { const timer = setTimeout(() => setCalibrated(false), 1800); return () => clearTimeout(timer); } }, [calibrated]);

  const choose = (spec: RoadSpec) => {
    try { engine.current?.selectRoad(spec); setResult(null); setNewBest(false); setMenu(false); setShareMessage(""); setShareValue(null); }
    catch { setError(true); }
  };
  const loadSeed = (value: string) => { const spec = parseRoadCode(value); setSeedError(!spec); if (spec) choose(spec); };
  const showModes = () => { engine.current?.openMenu(); setProgress(readRoadProgress()); setMenu(true); };
  const updateSteering = () => {
    const values = [...heldPointers.current.values()];
    const steering = Number(values.includes(1)) - Number(values.includes(-1));
    engine.current?.steer(steering); setPressed(steering);
  };
  const toggleSound = () => {
    mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); engine.current?.setMuted(mutedRef.current);
    try { localStorage.setItem(ROAD_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(ROAD_STORAGE_KEY) ?? "{}"), muted: mutedRef.current })); } catch { /* Optional. */ }
  };
  const copySeed = async (link = false) => {
    const url = new URL(`/${lang}/play/`, window.location.origin); url.searchParams.set("road", snapshot.code);
    const value = link ? url.toString() : snapshot.code;
    try { await navigator.clipboard.writeText(value); setShareMessage(ui.copied); }
    catch { setShareValue(value); setShareMessage(ui.copyManually); requestAnimationFrame(() => { codeField.current?.focus(); codeField.current?.select(); }); }
  };
  const remember = () => { if (saveRoad(snapshot.code)) { setSaved(readSavedRoads()); setShareMessage(ui.savedOne); } else setShareMessage(ui.storageError); };
  const calibrate = () => { if (engine.current?.calibrateGyro()) setCalibrated(true); };
  const play = () => { setResult(null); setNewBest(false); engine.current?.play(); };
  const ended = snapshot.phase === "over" || snapshot.phase === "finished";
  const flyingIn = snapshot.phase === "intro", overview = snapshot.phase === "overview";
  const showPanel = menu || !ready || error || (snapshot.phase !== "running" && !flyingIn && !overview);
  const stopLooking = () => { lookPointer.current = null; engine.current?.lookAround(0, 0); };
  const modeLabel = snapshot.mode === "endless" ? ui.endless : snapshot.level === 1 ? ui.tutorial : `${ui.level} ${snapshot.level}`;
  const cue = snapshot.rhythmCue;
  const cueArrow = cue.state === "switch" || cue.state === "late" ? (cue.direction > 0 ? "←" : "→") : (cue.direction > 0 ? "→" : "←");
  const cueText = cue.state === "start" ? ui.rhythmStart : cue.state === "air" ? ui.rhythmAir : `${cueArrow} ${cue.state === "switch" ? ui.rhythmSwitch : cue.state === "late" ? ui.rhythmLate : ui.rhythmHold}`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="egg-road" data-panel={showPanel} role="dialog" aria-modal="true" aria-label={ui.title} tabIndex={-1} ref={modal}
      onKeyDown={event => {
        if (event.code === "KeyF" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) {
          event.preventDefault(); void fullscreen.toggle(); return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...(modal.current?.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']),input:not([disabled]),summary,a[href]") ?? [])].filter(el => el.offsetParent !== null);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="egg-road-scene" ref={canvasHost} />
      <div className="egg-road-vignette" aria-hidden="true" />
      <header className="egg-road-hud">
        <button className="egg-road-icon egg-road-exit" type="button" onClick={menu ? onClose : showModes} aria-label={menu ? publicPage ? ui.publicClose : ui.close : ui.modes}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
        </button>
        <div className="egg-road-score" style={{ visibility: showPanel ? "hidden" : "visible" }}>
          <span>{ui.title}</span><strong>{String(snapshot.score).padStart(2, "0")}</strong>
          <small>{ui.score} · {ui.best} {best}</small><span className="egg-road-level">{modeLabel}</span>
          {!showPanel && !flyingIn && !overview && <div className="egg-road-notices">
            {snapshot.airborne ? <div className="egg-road-flight" role="status"><span>{ui.air}</span><strong>{snapshot.flightLeft.toFixed(1)}</strong><div><i style={{ transform: `scaleX(${snapshot.flightLeft / 4.2})` }} /></div></div>
              : snapshot.bonus ? <div className="egg-road-shortcut" role="status">{ui.bonusNames[snapshot.bonus.kind]} <b>+{snapshot.bonus.points}</b></div> : null}
          </div>}
        </div>
        <div className="egg-road-hud-actions">
        {!fullscreen.standalone && <button className="egg-road-icon egg-road-fullscreen" type="button" onClick={() => void fullscreen.toggle()} disabled={fullscreen.pending} aria-label={fullscreen.active ? ui.fullscreenExit : ui.fullscreenEnter} title={fullscreen.active ? ui.fullscreenExit : ui.fullscreenEnter} aria-pressed={fullscreen.active}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={fullscreen.active ? "M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5" : "M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"} /></svg>
        </button>}
        <button className="egg-road-icon" type="button" onClick={() => engine.current?.pause()} disabled={!ready || menu || !["running", "intro", "overview"].includes(snapshot.phase)} aria-label={ui.pause}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
        </button>
        </div>
      </header>
      {!showPanel && !flyingIn && !overview && <>
        {([-1, 1] as const).map(direction => <button key={direction} type="button" tabIndex={-1}
          className={`egg-road-steer ${direction < 0 ? "is-left" : "is-right"} ${pressed === direction ? "is-held" : ""}`}
          aria-label={direction < 0 ? ui.left : ui.right}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); heldPointers.current.set(event.pointerId, direction); updateSteering(); }}
          onPointerUp={event => { heldPointers.current.delete(event.pointerId); updateSteering(); }}
          onPointerCancel={event => { heldPointers.current.delete(event.pointerId); updateSteering(); }}
          onLostPointerCapture={event => { heldPointers.current.delete(event.pointerId); updateSteering(); }}>
          <span aria-hidden="true">{direction < 0 ? "‹" : "›"}</span>
        </button>)}
        <button className="egg-road-look" type="button" tabIndex={-1} aria-label={ui.lookDrag}
          onPointerDown={event => { if (lookPointer.current) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; }}
          onPointerMove={event => { const start = lookPointer.current; if (start?.id === event.pointerId) engine.current?.lookAround((event.clientX - start.x) / 48, (event.clientY - start.y) / 70); }}
          onPointerUp={stopLooking} onPointerCancel={stopLooking} onLostPointerCapture={stopLooking}>
          <span aria-hidden="true">◎</span><small>{ui.look}</small>
        </button>
        {gyro === "on" && <button className="egg-road-calibrate" type="button" onClick={calibrate} aria-label={ui.calibrate}>{calibrated ? "✓" : ui.calibrateShort}</button>}
        <div className={`egg-road-rhythm ${cue.state === "switch" ? "is-ready" : ""} ${snapshot.boost > .1 ? "is-charged" : ""}`}>
          <strong>{Math.round(snapshot.speed * 3.6)} <small>{ui.speedUnit}</small></strong>
          <div className="egg-road-stroke"><i style={{ transform: `scaleX(${cue.progress})` }} /></div>
          <span className="egg-road-cue">{cueText}</span>
          <span>{ui.rhythm} ×{snapshot.rhythm} · +{Math.round(snapshot.boost * 32.4)} {ui.speedUnit}</span>
        </div>
        <div className="egg-road-active-bonuses">{snapshot.activeBonuses.map(kind => <span key={kind}>{ui.bonusNames[kind]} +</span>)}</div>
        <div className="egg-road-key-hint">{ui.keyboard}</div>
      </>}
      {!showPanel && (flyingIn || overview) && <div className="egg-road-flyby">
        <p>{snapshot.mode === "endless" ? ui.endlessView : ui.flyby}</p>
        <button type="button" onClick={overview ? play : () => engine.current?.skipFlyby()}>{overview ? ui.overviewStart : ui.skipFlyby} <span aria-hidden="true">↗</span></button>
      </div>}
      {showPanel && <div className="egg-road-overlay"><section className={`egg-road-panel ${menu ? "egg-road-menu" : ""}`}>
        <p className="egg-road-kicker">{menu ? ui.modes : modeLabel}</p>
        <h1>{error ? ui.error : menu ? ui.title : snapshot.phase === "paused" ? ui.paused : ended ? snapshot.finished ? ui.finished : ui.over : ui.title}</h1>
        {fullscreen.notice && <div className="egg-road-fullscreen-note" role="status"><p>{fullscreen.notice === "install" ? ui.fullscreenInstall : ui.fullscreenUnavailable}</p>{fullscreen.notice === "install" && !publicPage && <a href={`/${lang}/play/?road=${snapshot.code}`}>{ui.fullscreenGamePage}</a>}</div>}
        {!error && <RoadAccount lang={lang} account={account} reload={board.reload} failed={board.failed} suggestedName={board.name} />}
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
            <button disabled={!ready} onClick={() => choose({ mode: "practice", level: 1, seed: 0 })}><strong>{ui.tutorial}</strong><small>{ui.practiceHint}</small></button>
            <button disabled={!ready} onClick={() => choose({ mode: "levels", ...progress })}><strong>{ui.levels}</strong><small>{ui.levelsHint} {progress.level}</small></button>
            <button disabled={!ready} onClick={() => choose({ mode: "endless", level: 2, seed: newRoadSeed() })}><strong>∞ {ui.endless}</strong><small>{ui.endlessHint}</small></button>
            <button disabled={!ready} onClick={() => { seedField.current?.focus(); seedField.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}><strong>{ui.seedMode}</strong><small>{ui.seedHint}</small></button>
          </div>
          {!ready && <p role="status">{ui.loading}</p>}
          <form className="egg-road-seed-form" onSubmit={event => { event.preventDefault(); loadSeed(seedInput); }}>
            <label htmlFor="egg-road-seed">{ui.seedHint}</label>
            <div><input ref={seedField} id="egg-road-seed" value={seedInput} maxLength={2048} placeholder="EGG1-R-2-ABC" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-invalid={seedError} aria-describedby={seedError ? "egg-road-seed-error" : undefined} onChange={event => { setSeedInput(event.target.value); setSeedError(false); }} /><button disabled={!ready || !seedInput.trim()}>{ui.openSeed}</button></div>
            {seedError && <p id="egg-road-seed-error" role="alert">{ui.seedError}</p>}
          </form>
          {saved.length > 0 && <details className="egg-road-help"><summary>{ui.saved} · {saved.length}</summary><ul className="egg-road-saved">{saved.map(code => <li key={code}><button onClick={() => loadSeed(code)}>{code}</button><button aria-label={`${ui.remove} ${code}`} onClick={() => { if (forgetRoad(code)) setSaved(readSavedRoads()); }}>{ui.remove}</button></li>)}</ul></details>}
          </>}
          </div>
        </> : <>
          <p className="egg-road-intro">{error ? ui.errorText : snapshot.phase === "paused" ? ui.pausedText : ended ? snapshot.finished ? snapshot.mode === "levels" ? ui.finishedText : ui.seedFinished : ui.overText : ui.intro}</p>
          {ended && <><div className="egg-road-result"><strong>{snapshot.score}<span>{ui.score}</span></strong><dl><div><dt>{ui.gates}</dt><dd>{snapshot.gates}</dd></div><div><dt>{ui.distance}</dt><dd>{Math.floor(snapshot.distance)}</dd></div></dl></div>{newBest && <p className="egg-road-record">{ui.newBest}</p>}</>}
          {!error && <>
            {snapshot.phase === "ready" && <p className="egg-road-rhythm-intro">{ui.character}</p>}
            {ready && <p className="egg-road-personal-best">{ui.trackBest}: <strong>{best}</strong></p>}
            <button className="egg-road-primary" type="button" disabled={!ready} onClick={play}>{!ready ? ui.loading : snapshot.phase === "paused" ? ui.resume : snapshot.finished && snapshot.mode === "levels" ? ui.next : ended ? ui.retry : ui.start}<span aria-hidden="true">↗</span></button>
            {ready && snapshot.phase !== "paused" && <button className="egg-road-overview" type="button" onClick={() => { setResult(null); setNewBest(false); engine.current?.overview(); }}>{ui.overview} ◎</button>}
            {ready && ended && <RoadRecords lang={lang} board={board} result={result} />}
            {ready && <div className="egg-road-map-code"><label htmlFor="egg-road-code">{ui.code}</label><input id="egg-road-code" ref={codeField} readOnly value={shareValue ?? snapshot.code} onClick={event => event.currentTarget.select()} /><div><button onClick={() => void copySeed()}>{ui.copyCode}</button><button onClick={() => void copySeed(true)}>{ui.copyLink}</button><button disabled={saved.includes(snapshot.code)} onClick={remember}>{saved.includes(snapshot.code) ? ui.savedOne : ui.save}</button></div>{shareMessage && <p role="status">{shareMessage}</p>}</div>}
            {ended && <details className="egg-road-help"><summary>{ui.scoreBreakdown}</summary><dl className="egg-road-breakdown">{(Object.keys(snapshot.breakdown) as BonusKind[]).filter(kind => snapshot.breakdown[kind] > 0).map(kind => <div key={kind}><dt>{ui.bonusNames[kind]}</dt><dd>+{snapshot.breakdown[kind]}</dd></div>)}</dl></details>}
            {ready && !ended && <RoadRecords lang={lang} board={board} result={null} />}
            <details className="egg-road-help"><summary>{ui.help}</summary><p>{ui.rhythmHelp}</p><ul>{[ui.gateRule, ui.edgeRule, ui.speedRule, ui.rhythmRule, ui.dropRule, ui.shortcutRule].map(rule => <li key={rule}>{rule}</li>)}</ul><p>{ui.fairRule}</p></details>
            {snapshot.phase === "ready" && <p className="egg-road-controls-copy">{ui.controls}<br />{ui.keyboard}<br />{ui.lookHint}</p>}
          </>}
        </>}
        {!error && ready && <div className="egg-road-options">
          <button type="button" aria-pressed={gyro === "on" || gyro === "waiting"} onClick={() => engine.current?.toggleGyro()}>{gyro === "on" ? ui.gyroOn : gyro === "waiting" ? ui.gyroWaiting : ui.gyroOff}</button>
          {gyro === "on" && <><button type="button" onClick={calibrate}>{calibrated ? ui.calibrated : ui.calibrate}</button><p>{ui.tiltNote}</p></>}
          {gyro === "unavailable" && <p role="status">{ui.gyroMissing}</p>}
        </div>}
        <div className="egg-road-panel-footer"><button type="button" onClick={menu ? onClose : showModes}>{menu ? publicPage ? ui.publicClose : ui.close : ui.modes}</button>{!error && <button type="button" onClick={toggleSound} aria-pressed={!muted}>{muted ? ui.soundOff : ui.soundOn}</button>}</div>
        {publicPage && menu && <p className="egg-road-adepts">{ui.moreGames} <a href={`/${lang}/quiz/`}>{ui.initiation}</a></p>}
      </section></div>}
      {snapshot.mode !== "endless" && <div className="egg-road-progress" aria-hidden="true"><i style={{ transform: `scaleX(${snapshot.progress})` }} /></div>}
    </div>, document.body,
  );
}
