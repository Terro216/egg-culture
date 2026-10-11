import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRoadFullscreen } from "../EggRoad/fullscreen.ts";
import { fryCopy } from "./copy.ts";
import { fryShareUrl } from "./links.ts";
import { COLLECTION_STEP, compactCount, fryCode, MAX_COLLECTION_MULTIPLIER, newFrySeed, operationLabel, parseFryCode, STARTING_EGGS } from "./rules.ts";
import type { FryLang } from "./rules.ts";
import type { FryEngine } from "./engine.ts";
import type { FrySnapshot } from "./simulation.ts";
import { readFryProgress, saveFryMilestones, saveFryPreferences, saveFryResult } from "./storage.ts";
import { activePortalName } from "../Portal/local.ts";
import { beginPortalRun, submitPortalResult } from "../Portal/client.ts";
import ResultSync from "../Portal/ResultSync.tsx";
import type { FryResult } from "./storage.ts";
import { fryKeyAction } from "./controls.ts";
import { useGameModal } from "../../shared/game/useGameModal.ts";
import "./EggFry.css";

const emptySnapshot: FrySnapshot = { phase: "ready", eggs: STARTING_EGGS, peak: STARTING_EGGS, x: 0, distance: 0, seconds: 0,
  sector: 0, untilExit: 352, speed: 9.5, shield: false, fryProgress: 0, received: 0n, countdown: 0, result: null, notice: null, selectedSide: 0,
  cancelCharges: 0, brakeCharges: 0, gateCancelled: false, brakeRemaining: 0, invertPending: 0, invertRemaining: 0, split: false, collectionMultiplier: 1, skillPoints: 0, mysteryAhead: false };

export default function EggFry({ lang, onClose, onComplete, publicPage = false }: { lang: FryLang; onClose(): void; onComplete?(result: FryResult): void; publicPage?: boolean }) {
  const ui = fryCopy[lang];
  const closeLabel = publicPage ? ui.publicClose : ui.close;
  const root = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), engine = useRef<FryEngine | null>(null);
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const [snapshot, setSnapshot] = useState<FrySnapshot>(emptySnapshot);
  const [progress, setProgress] = useState(readFryProgress);
  const [seed, setSeed] = useState(() => typeof window === "undefined" ? 0 : parseFryCode(new URL(window.location.href).searchParams.get("fry")) ?? newFrySeed());
  const initialSeed = useRef(seed);
  const runOwner = useRef(activePortalName());
  const portalRun = useRef(beginPortalRun("fry"));
  const [muted, setMuted] = useState(progress.muted), [reducedMotion, setReducedMotion] = useState(progress.reducedMotion);
  const [newBest, setNewBest] = useState(false), [unlocked, setUnlocked] = useState<string[]>([]);
  const [share, setShare] = useState(""), [copied, setCopied] = useState(false);
  const fullscreen = useRoadFullscreen(root, () => engine.current?.pause());
  const active = snapshot.phase === "running", frying = snapshot.phase === "frying", result = snapshot.phase === "result";
  const paused = snapshot.phase === "paused", countdown = snapshot.phase === "countdown", falling = snapshot.phase === "falling";
  const atExit = active && snapshot.untilExit < 54 && !snapshot.mysteryAhead;
  useGameModal(root, true, () => active || frying || falling || countdown ? engine.current?.pause() : onClose());

  useEffect(() => {
    const abort = new AbortController();
    let instance: FryEngine | null = null;
    const preferences = readFryProgress();
    const calm = preferences.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(calm);
    void import("./engine.ts").then(({ createFryEngine }) => {
      if (!host.current || abort.signal.aborted) return null;
      return createFryEngine(host.current, lang, initialSeed.current, {
        update: value => {
          setSnapshot(value);
          if (value.phase === "running" && engine.current) {
            const sim = engine.current.simulation;
            saveFryMilestones(sim.peak, sim.jackpot, value.sector + 1, sim.dodged, sim.swaps, runOwner.current);
          }
        },
        complete: completed => {
          if (abort.signal.aborted) return;
          const saved = saveFryResult(completed, runOwner.current); setProgress(saved.progress); setNewBest(saved.newBest); setUnlocked(saved.unlocked);
          submitPortalResult(portalRun.current, { score: completed.success ? completed.eggs.toString() : "0", peak: completed.peak.toString(), seconds: completed.seconds,
            sector: completed.sector, losses: completed.losses, jackpot: completed.jackpot, dodged: completed.dodged ?? 0, swaps: completed.swaps ?? 0 });
          completeRef.current?.(completed);
        },
        failure: () => { if (!abort.signal.aborted) setError(true); },
      }, abort.signal);
    }).then(created => {
      if (!created) return;
      if (abort.signal.aborted) { created.dispose(); return; }
      instance = created; engine.current = created; created.audio.setMuted(preferences.muted); created.reducedMotion = calm; setReady(true);
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => { abort.abort(); instance?.dispose(); engine.current = null; };
  }, [lang]);

  const restart = (same: boolean) => {
    runOwner.current = activePortalName();
    portalRun.current = beginPortalRun("fry");
    const next = same ? seed : newFrySeed(); setSeed(next); setNewBest(false); setUnlocked([]); setShare(""); setCopied(false);
    engine.current?.reset(next); root.current?.focus();
  };
  const toggleSound = () => {
    const next = !muted; setMuted(next); engine.current?.audio.setMuted(next); saveFryPreferences({ muted: next, reducedMotion });
  };
  const toggleMotion = () => {
    const next = !reducedMotion; setReducedMotion(next); if (engine.current) engine.current.reducedMotion = next;
    saveFryPreferences({ muted, reducedMotion: next });
  };
  const copyLink = async () => {
    const url = fryShareUrl(lang, seed, window.location.origin);
    try { await navigator.clipboard.writeText(url.href); setCopied(true); } catch { setShare(url.href); }
  };
  const releasePointer = (event: React.PointerEvent) => { engine.current?.steering.end(event.pointerId); };
  const achievements: Record<string, string> = { one: ui.one, thousand: ui.thousand, clean: ui.clean, jackpot: ui.jackpotAchievement, million: ui.million, dodger: ui.dodger, risk: ui.risk, switcher: ui.switcher };
  const notice = snapshot.notice;
  const mysteryText = notice?.effect ? notice.effect.kind === "operation" ? operationLabel(notice.effect.operation, lang) : notice.effect.kind === "shield" ? ui.shield : notice.effect.kind === "cancel" ? ui.cancelPower : ui.brakePower : "?";
  const noticeText = notice ? notice.kind === "mystery" ? `? → ${mysteryText}` : notice.kind === "shield" ? ui.shieldFound : notice.kind === "protected" ? ui.shieldUsed : notice.kind === "cancel" ? ui.cancelFound
    : notice.kind === "brake" ? snapshot.brakeRemaining ? ui.brakePower : ui.brakeFound : notice.kind === "cancelled" ? ui.cancelled
    : notice.kind === "jackpot" ? `${ui.jackpot} · +${compactCount(notice.amount, lang)}` : `${notice.kind === "loss" ? "−" : "+"}${compactCount(notice.amount, lang)}` : "";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={root} className={`egg-fry ${reducedMotion ? "egg-fry--calm" : ""}`} role="dialog" aria-modal="true" aria-labelledby="egg-fry-title" tabIndex={-1}
      onKeyDown={event => {
        const action = fryKeyAction(event);
        if (action === "steer" && active) { event.preventDefault(); engine.current?.key(event.code, true); }
        else if (action === "center" && active && snapshot.mysteryAhead) { event.preventDefault(); engine.current?.selectCenter(); }
        else if (action === "cancel" && active) { event.preventDefault(); engine.current?.cancelGate(); }
        else if (action === "brake" && active) { event.preventDefault(); engine.current?.brake(); }
        else if (action === "pause" && (active || paused || frying || falling || countdown)) { event.preventDefault(); paused ? engine.current?.resume() : engine.current?.pause(); }
      }}
      onKeyUp={event => engine.current?.key(event.code, false)}>
      <div className="egg-fry-stage" ref={host}
        onPointerDown={event => {
          if (!active || (event.pointerType === "mouse" && event.button !== 0)) return;
          event.currentTarget.setPointerCapture(event.pointerId); engine.current?.steering.begin(event.pointerId, event.clientX, event.currentTarget.clientWidth);
        }}
        onPointerMove={event => { if (active) engine.current?.steering.move(event.pointerId, event.clientX); }}
        onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}
        onContextMenu={event => event.preventDefault()} />
      <div className="egg-fry-vignette" aria-hidden="true" />
      <header className="egg-fry-toolbar">
        <button type="button" className="egg-fry-icon" onClick={onClose} aria-label={closeLabel} title={closeLabel}>←</button>
        <h1 id="egg-fry-title">{ui.title}</h1>
        <div>
          <button type="button" className="egg-fry-icon" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? ui.soundOff : ui.soundOn} title={muted ? ui.soundOff : ui.soundOn}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M17 8q5 4 0 8m3-11q7 7 0 14" />}</svg>
          </button>
          {(active || frying || falling || countdown) && <button type="button" className="egg-fry-icon" onClick={() => engine.current?.pause()} aria-label={ui.pause} title={ui.pause}>Ⅱ</button>}
          {!fullscreen.standalone && <button type="button" className="egg-fry-icon egg-fry-fullscreen" onClick={() => void fullscreen.toggle()} disabled={fullscreen.pending} aria-label={fullscreen.active ? ui.fullscreenExit : ui.fullscreen} title={ui.fullscreen}>⛶</button>}
        </div>
      </header>

      {(active || frying || falling || countdown) && <div className="egg-fry-hud">
        <div className="egg-fry-counter"><strong data-testid="fry-count">{compactCount(frying ? snapshot.received : snapshot.eggs, lang)}</strong><span>{frying ? ui.delivered : ui.count}</span></div>
        <div className="egg-fry-status">
          <span>{ui.sector} {snapshot.result?.sector ?? snapshot.sector + 1}</span>
          <span>{frying ? ui.frying : falling ? ui.falling : `${ui.exitIn} ${Math.ceil(snapshot.untilExit)} ${ui.metres}`}</span>
          {!frying && !falling && <span>{ui.speed} ×{(snapshot.speed / 9.5).toFixed(1)}</span>}
        </div>
        {active && <div key={`level-${snapshot.collectionMultiplier}`} className="egg-fry-mastery" title={ui.collectionHint}>
          <b>{ui.collection} ×{snapshot.collectionMultiplier}</b>
          <span>{ui.level} {snapshot.collectionMultiplier}</span>
          <progress aria-label={ui.collectionHint} max={COLLECTION_STEP} value={snapshot.collectionMultiplier === MAX_COLLECTION_MULTIPLIER ? COLLECTION_STEP : snapshot.skillPoints % COLLECTION_STEP} />
          <small>{snapshot.collectionMultiplier === MAX_COLLECTION_MULTIPLIER ? ui.maxLevel : `${snapshot.skillPoints % COLLECTION_STEP}/${COLLECTION_STEP}`}</small>
        </div>}
        {snapshot.shield && !frying && <span className="egg-fry-shield" title={ui.shieldHint}>▣ {ui.shield}</span>}
        {active && (snapshot.invertPending > 0 || snapshot.invertRemaining > 0 || snapshot.split || snapshot.brakeRemaining > 0) && <div className="egg-fry-modifier" role="status">
          {snapshot.invertPending > 0 ? `⇄ ${ui.invertSoon}` : snapshot.invertRemaining > 0 ? `⇄ ${ui.inverted} · ${Math.ceil(snapshot.invertRemaining)} ${ui.seconds}` : snapshot.brakeRemaining > 0 ? `Ⅱ ${ui.brakePower} · ${Math.ceil(snapshot.brakeRemaining)} ${ui.seconds}` : ui.split}
        </div>}
        {active && notice && <div key={notice.id} className={`egg-fry-notice egg-fry-notice--${notice.kind}`} role="status">{noticeText}</div>}
      </div>}

      {active && <>
        {atExit ? <div className="egg-fry-choice"><p>{ui.choice}</p><div><span className={snapshot.selectedSide === 0 ? "is-selected" : ""}>{ui.panHint}</span><span className={snapshot.selectedSide === 1 ? "is-selected" : ""}>{ui.onwardHint}</span></div></div>
          : snapshot.seconds < 12 && <p className="egg-fry-hint">{snapshot.seconds < 5 ? ui.tutorial : ui.gateHint}</p>}
        <div className="egg-fry-steering" aria-label={ui.controls}>
          <button type="button" aria-label={ui.chooseLeft} onClick={() => engine.current?.selectSide(-1)}>←</button>
          <button type="button" aria-label={ui.chooseRight} onClick={() => engine.current?.selectSide(1)}>→</button>
        </div>
        {snapshot.mysteryAhead && <button className="egg-fry-mystery-choice" type="button" aria-label={ui.chooseMystery} onClick={() => { engine.current?.selectCenter(); root.current?.focus({ preventScroll: true }); }}>? · {ui.mystery} <small>↓ / S</small></button>}
        {(snapshot.cancelCharges > 0 || snapshot.brakeCharges > 0 || snapshot.gateCancelled || snapshot.brakeRemaining > 0) && <div className="egg-fry-powers">
          {(snapshot.cancelCharges > 0 || snapshot.gateCancelled) && <button type="button" disabled={snapshot.gateCancelled || !snapshot.cancelCharges} title={ui.cancelHint} aria-label={ui.cancelHint} onClick={() => { engine.current?.cancelGate(); root.current?.focus({ preventScroll: true }); }}><b>⊘</b><span>{snapshot.gateCancelled ? ui.cancelled : ui.cancelPower}<small>{snapshot.gateCancelled ? "✓" : `E · ${snapshot.cancelCharges}`}</small></span></button>}
          {(snapshot.brakeCharges > 0 || snapshot.brakeRemaining > 0) && <button type="button" disabled={snapshot.brakeRemaining > 0 || !snapshot.brakeCharges} title={ui.brakeHint} aria-label={ui.brakeHint} onClick={() => { engine.current?.brake(); root.current?.focus({ preventScroll: true }); }}><b>Ⅱ</b><span>{ui.brakePower}<small>{snapshot.brakeRemaining > 0 ? `${Math.ceil(snapshot.brakeRemaining)} ${ui.seconds}` : `F · ${snapshot.brakeCharges}`}</small></span></button>}
        </div>}
      </>}
      {frying && <button className="egg-fry-skip" type="button" onClick={() => engine.current?.skip()}>{ui.skip} →</button>}
      {countdown && <div className="egg-fry-countdown" role="status">{Math.max(1, Math.ceil(snapshot.countdown))}</div>}

      {(snapshot.phase === "ready" || paused || result || error) && <div className="egg-fry-overlay"><div className={`egg-fry-panel ${result ? "egg-fry-panel--result" : ""}`}>
        {error ? <>
          <p className="egg-fry-eyebrow">{ui.title}</p><h2>{ui.error}</h2><p>{ui.errorNote}</p><button className="egg-fry-primary" type="button" onClick={onClose}>{closeLabel}</button>
        </> : paused ? <>
          <p className="egg-fry-eyebrow">{ui.title}</p><h2>{ui.paused}</h2><p>{ui.pauseNote}</p>
          <button className="egg-fry-primary" type="button" onClick={() => { engine.current?.resume(); root.current?.focus(); }}>{ui.resume}</button>
          <button className="egg-fry-text-button" type="button" onClick={onClose}>{closeLabel}</button>
        </> : result && snapshot.result ? <>
          <p className="egg-fry-eyebrow">{newBest ? ui.newBest : snapshot.result.success ? ui.accepted : ui.failed}</p>
          <h2 className="egg-fry-result-number" title={snapshot.result.eggs.toLocaleString(lang)}>{compactCount(snapshot.result.eggs, lang)}</h2>
          <p>{snapshot.result.success ? ui.delivered : ui.failedNote}</p>
          <ResultSync lang={lang} owner={portalRun.current.owner} />
          <p className="egg-fry-help">{ui.collection} ×{snapshot.result.collectionMultiplier ?? 1} · {ui.level} {snapshot.result.collectionMultiplier ?? 1}</p>
          <dl className="egg-fry-results"><div><dt>{ui.peak}</dt><dd>{compactCount(snapshot.result.peak, lang)}</dd></div><div><dt>{ui.time}</dt><dd>{Math.floor(snapshot.result.seconds)} {ui.seconds}</dd></div><div><dt>{ui.best}</dt><dd>{compactCount(BigInt(progress.best), lang)}</dd></div></dl>
          {unlocked.length > 0 && <div className="egg-fry-achievements" aria-label={ui.achievements}>{unlocked.map(key => <span key={key}>✦ {achievements[key]}</span>)}</div>}
          <button className="egg-fry-primary" type="button" onClick={() => restart(false)}>{ui.newRun} →</button>
          <button className="egg-fry-secondary" type="button" onClick={() => restart(true)}>{ui.retry}</button>
          <div className="egg-fry-route"><code>{fryCode(seed)}</code><button type="button" onClick={() => void copyLink()}>{copied ? ui.copied : ui.copy}</button></div>
          {share && <label className="egg-fry-share">{ui.copyFallback}<input readOnly value={share} onFocus={event => event.currentTarget.select()} /></label>}
        </> : <>
          <p className="egg-fry-eyebrow">{ui.season}</p>
          <div className="egg-fry-emblem" aria-hidden="true"><span /><span /><span /><b>×20</b></div>
          <h2>{ui.title}</h2><p className="egg-fry-intro">{ui.intro}</p>
          <p className="egg-fry-start-count">{ui.readyCount}</p>
          <button className="egg-fry-primary" type="button" disabled={!ready} onClick={() => { runOwner.current = activePortalName(); portalRun.current = beginPortalRun("fry"); engine.current?.start(); root.current?.focus(); }}>{ready ? ui.start : ui.loading} <span>→</span></button>
          <p className="egg-fry-help">{ui.controls}</p><p className="egg-fry-help">{ui.rules}</p>
          <p className="egg-fry-help">{ui.collectionHint}</p>
          {publicPage && <p className="egg-fry-help">{ui.publicGuest}</p>}
          <details className="egg-fry-help"><summary>{lang === "ru" ? "Что изменилось" : "What changed"}</summary><p>{ui.harder}</p></details>
          {BigInt(progress.best) > 0n && <p className="egg-fry-menu-best">{ui.best}: <b>{compactCount(BigInt(progress.best), lang)}</b></p>}
          <p className="egg-fry-help"><a href={`/${lang}/profile/`}>{lang === "ru" ? "Единый профиль и достижения →" : "Shared profile and achievements →"}</a></p>
        </>}
        {!error && <div className="egg-fry-settings"><button type="button" onClick={toggleMotion} aria-pressed={reducedMotion}>{reducedMotion ? "✓ " : ""}{ui.reduceMotion}</button></div>}
        {fullscreen.notice && <p className="egg-fry-help" role="status">{ui.fullscreenNote}</p>}
      </div></div>}
    </div>, document.body,
  );
}
