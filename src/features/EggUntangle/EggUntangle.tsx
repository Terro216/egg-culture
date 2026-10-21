import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { analyzeBoard, campaignSeed, dailySeed, findSwapHint, formatSeed, generatePuzzle, isCampaignSeed, isDailySeed, isSlotPermutation, isTutorialSeed, LEVEL_COUNT, moscowDay, nextCampaignSeed, parseSeed, swapNodes } from "./engine.ts";
import type { Point, PuzzleMechanics } from "./types.ts";
import { mergeNestProgress, readNestProgress, readNestSession, saveNestRecord, saveNestSession } from "./storage.ts";
import type { NestMode, NestProgress, NestSession } from "./storage.ts";
import { beginPortalRun, portalState, settledPortal, submitPortalResult } from "../Portal/client.ts";
import { activePortalName } from "../Portal/local.ts";
import PortalPresence, { usePortal } from "../Portal/PortalPresence.tsx";
import ResultSync from "../Portal/ResultSync.tsx";
import GuestNestResults from "./GuestNestResults.tsx";
import { nestStory } from "./story.ts";
import { swapFrame, SWAP_DURATION_MS } from "./motion.ts";
import { graphComponents } from "./geometry.ts";
import "./EggUntangle.css";

// Narrow crown, fuller lower body; the entire shell stays inside the existing
// 32-unit rope clearance. Its hit target remains larger than its silhouette.
const EGG_OUTLINE = "M 0,-32 C 9,-32 22,-6 22,9 C 22,24 13,32 0,32 C -13,32 -22,24 -22,9 C -22,-6 -9,-32 0,-32 Z";

const chapters = {
  ru: ["Первый белок", "Терруар переплетений", "Монастырь халазы", "Великий Купол"],
  en: ["The first albumen", "Terroir of tangles", "The chalaza monastery", "The Great Dome"],
};
const plural = (n: number, forms: readonly [string, string, string]) => forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const clone = (points: Point[]) => points.map(p => ({ ...p }));
const matchesDaily = (day: string | null, seed: string) => Boolean(day && day <= moscowDay() && isDailySeed(seed, day));
type Drag = { id: number; pointer: number; before: Point[]; start: Point };
type SwapMotion = { from: Point[]; points: Point[]; moving: number[] };

export default function EggUntangle({ lang }: { lang: "ru" | "en" }) {
  const ru = lang === "ru", portal = usePortal(), uid = useId().replace(/:/g, "");
  const [session, setSession] = useState<NestSession | null>(null), current = useRef<NestSession | null>(null);
  const [progress, setProgress] = useState<NestProgress>({ campaign: [], puzzles: [] });
  const [mode, setMode] = useState<NestMode>("campaign"), [level, setLevel] = useState(1), [code, setCode] = useState("");
  const [mechanics, setMechanics] = useState<PuzzleMechanics>("drag");
  const [swapSelection, setSwapSelection] = useState<number | null>(null), swapChoice = useRef<number | null>(null);
  const [swapHint, setSwapHint] = useState<[number, number] | null>(null);
  const [motion, setMotion] = useState<SwapMotion | null>(null);
  const flight = useRef<{ frame: number } | null>(null), reduceMotion = useRef(false);
  const [paused, setPaused] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<number | null>(null), [message, setMessage] = useState("");
  const [ready, setReady] = useState(false), [durable, setDurable] = useState(true), [shareLink, setShareLink] = useState("");
  const [undo, setUndo] = useState<Point[][]>([]), [redo, setRedo] = useState<Point[][]>([]);
  const [today, setToday] = useState(() => moscowDay());
  const svg = useRef<SVGSVGElement>(null), drag = useRef<Drag | null>(null), loadedOwner = useRef<string | null | undefined>(undefined);
  const active = useRef(true), pausedRef = useRef(false), didInit = useRef(false), started = useRef(false);
  const puzzle = useMemo(() => session ? generatePuzzle(session.seed) : null, [session?.seed]);
  const analysis = useMemo(() => session && puzzle ? analyzeBoard(motion?.from ?? session.points, puzzle.edges) : null, [session?.points, puzzle, motion?.from]);
  const viewPoints = motion?.points ?? session?.points ?? [], animating = motion !== null;
  const showResult = session?.done && !animating;
  const best = progress.puzzles.find(r => r.seed === session?.seed);
  const title = ru ? "Халазы судьбы" : "Chalazae of Fate";
  const chapter = chapters[lang][Math.min(3, Math.floor(((puzzle?.level ?? 1) - 1) / 6))];
  const story = nestStory(lang, puzzle?.level ?? 1), hard = mechanics === "swap";
  const completed = hard ? progress.hardCampaign ?? [] : progress.campaign;
  const activeNode = swapSelection ?? selected;
  const groups = useMemo(() => puzzle ? graphComponents(puzzle.initial.length, puzzle.edges) : [], [puzzle]);

  function clearSwap() { swapChoice.current = null; setSwapSelection(null); setSwapHint(null); }

  function settleMotion() {
    if (flight.current) cancelAnimationFrame(flight.current.frame);
    flight.current = null; setMotion(null);
  }
  function animateSwap(from: Point[], to: Point[]) {
    if (reduceMotion.current || document.hidden) return;
    const moving = from.flatMap((p, i) => p.x !== to[i].x || p.y !== to[i].y ? [i] : []);
    const transition = { frame: 0 }, start = performance.now();
    flight.current = transition;
    setMotion({ from, points: from, moving });
    const tick = (now: number) => {
      if (flight.current !== transition) return;
      const progress = Math.min(1, (now - start) / SWAP_DURATION_MS);
      if (progress >= 1) { flight.current = null; setMotion(null); return; }
      setMotion({ from, points: swapFrame(from, to, progress), moving });
      transition.frame = requestAnimationFrame(tick);
    };
    transition.frame = requestAnimationFrame(tick);
  }

  function update(next: NestSession) { current.current = next; setSession(next); }
  function persist(next: NestSession) { setDurable(saveNestSession(next)); }
  function cancelCurrentDrag() {
    const s = current.current, d = drag.current;
    if (s && d) { drag.current = null; const restored = { ...s, points: d.before }; update(restored); persist(restored); }
  }
  function finish(next: NestSession) {
    const p = generatePuzzle(next.seed);
    if (!analyzeBoard(next.points, p.edges).solved || p.mechanics === "swap" && !isSlotPermutation(p, next.points) || next.moves === 0) return;
    const done = { ...next, done: true };
    update(done); const sessionDurable = saveNestSession(done);
    const record = { seed: next.seed, level: p.level, mode: next.mode, ...(next.day ? { day: next.day } : {}), moves: next.moves, seconds: next.seconds, hints: next.hints };
    const saved = saveNestRecord(next.ticket.owner, record);
    if (next.ticket.owner === activePortalName()) setProgress(saved.progress);
    setDurable(sessionDurable && saved.durable);
    const accepted = submitPortalResult(next.ticket, { score: String(p.level), peak: String(p.level), seconds: next.seconds, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0,
      untangle: { ...record, positions: next.points } });
    if (!accepted) setMessage(ru ? "Не удалось записать результат. Раскладка сохранена; откройте игру снова для повторной отправки." : "The result could not be recorded. Your layout is retained; reopen the game to retry.");
    setHint(null); setSelected(null); clearSwap();
    if (next.ticket.owner === null) window.dispatchEvent(new Event("egg:nest-guest"));
  }
  function load(seed: string, nextMode: NestMode, day?: string, restart = false) {
    settleMotion();
    cancelCurrentDrag();
    const prior = current.current; if (prior) persist(prior);
    const p = generatePuzzle(seed), owner = activePortalName();
    const saved = restart ? null : readNestSession(owner, seed);
    // Opening a canonical daily/campaign upgrades the context of an unfinished shared puzzle.
    const changedContext = saved?.done && (saved.mode !== nextMode || saved.day !== day);
    const next: NestSession = saved ? { ...saved, ...(changedContext ? { ticket: beginPortalRun("untangle") } : {}), mode: nextMode, ...(day ? { day } : { day: undefined }) } : {
      seed: p.seed, mode: nextMode, ...(day ? { day } : {}), points: clone(p.initial), moves: 0, hints: 0, seconds: 0, ticket: beginPortalRun("untangle"), done: false,
    };
    update(next); persist(next); setMode(nextMode); setMechanics(p.mechanics); setLevel(p.level); setPaused(false); pausedRef.current = false; started.current = next.moves > 0 || next.seconds > 0;
    setUndo([]); setRedo([]); setSelected(null); setHint(null); clearSwap(); setMessage(""); setShareLink(""); drag.current = null;
    const url = new URL(location.href); url.searchParams.set("nest", seed); url.searchParams.delete("day"); url.searchParams.delete("level");
    if (nextMode === "daily" && day) url.searchParams.set("day", day);
    if (nextMode === "campaign") url.searchParams.set("level", String(p.level));
    if (p.mechanics === "swap") url.searchParams.set("rules", "swap"); else url.searchParams.delete("rules");
    history.replaceState(null, "", url);
    if (next.done || analyzeBoard(next.points, p.edges).solved) finish(next);
  }
  useEffect(() => {
    let disposed = false;
    void settledPortal().then(() => {
      if (disposed || didInit.current) return;
      didInit.current = true; loadedOwner.current = activePortalName();
      const state = portalState(), owner = activePortalName();
      setProgress(state.profile?.untangle ? mergeNestProgress(owner, state.profile.untangle) : readNestProgress(owner));
      const query = new URL(location.href).searchParams, parsed = parseSeed(query.get("nest") ?? ""), day = query.get("day");
      if (parsed) {
        const daily = matchesDaily(day, parsed.seed);
        load(parsed.seed, daily ? "daily" : isCampaignSeed(parsed.seed) ? "campaign" : "free", daily && day ? day : undefined);
      } else {
        const saved = readNestSession(owner);
        if (saved && (!saved.done || parseSeed(saved.seed)?.version !== "NEST1") && !query.has("rules")) load(saved.seed, saved.mode, saved.day);
        else load(campaignSeed(1, query.get("rules") === "swap" ? "swap" : "drag"), "campaign");
        if (query.has("nest")) setMessage(ru ? "Код кладки не распознан. Открыт первый уровень." : "Clutch code not recognised. Level one is open.");
      }
      setReady(true);
    });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!didInit.current) return;
    const owner = activePortalName();
    if (loadedOwner.current !== owner) {
      settleMotion();
      cancelCurrentDrag();
      if (current.current) persist(current.current);
      loadedOwner.current = owner;
      setProgress(portal.profile?.untangle ? mergeNestProgress(owner, portal.profile.untangle) : readNestProgress(owner));
      const previous = current.current, saved = readNestSession(owner);
      if (saved) load(saved.seed, saved.mode, saved.day);
      else load(previous?.seed ?? campaignSeed(1), previous?.mode ?? "campaign", previous?.day);
      setMessage(ru ? "Аккаунт изменился. Открыта его собственная кладка." : "Account changed. This account’s clutch is now open.");
    } else if (portal.profile?.untangle) setProgress(mergeNestProgress(owner, portal.profile.untangle));
  }, [portal.profile, portal.account]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { reduceMotion.current = media.matches; if (media.matches) settleMotion(); };
    changed(); media.addEventListener("change", changed);
    return () => { media.removeEventListener("change", changed); if (flight.current) cancelAnimationFrame(flight.current.frame); flight.current = null; };
  }, []);
  useEffect(() => {
    const cancelDrag = cancelCurrentDrag;
    const visibility = () => { active.current = !document.hidden && document.hasFocus(); if (!active.current) { cancelDrag(); settleMotion(); } if (current.current) persist(current.current); setToday(moscowDay()); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("blur", visibility); window.addEventListener("focus", visibility);
    const save = () => { cancelDrag(); settleMotion(); if (current.current) saveNestSession(current.current); };
    window.addEventListener("pagehide", save);
    let last = performance.now(), secondsSaved = 0;
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = Math.min(1.5, (now - last) / 1000); last = now;
      setToday(moscowDay());
      const s = current.current;
      if (s && !s.done && started.current && active.current && !document.hidden && !pausedRef.current) {
        const next = { ...s, seconds: Math.min(86400, s.seconds + elapsed) }; update(next);
        secondsSaved += elapsed; if (secondsSaved >= 3 && !drag.current) { saveNestSession(next); secondsSaved = 0; }
      }
    }, 1000);
    return () => { save(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", visibility); window.removeEventListener("focus", visibility); window.removeEventListener("pagehide", save); };
  }, []);

  function commit(points: Point[], before: Point[], historyMove = false) {
    const s = current.current; if (!s || s.done || pausedRef.current || flight.current) return;
    if (points.every((p, i) => p.x === before[i].x && p.y === before[i].y)) return;
    if (puzzle?.mechanics === "swap" && !isSlotPermutation(puzzle, points)) return;
    clearSwap();
    if (!historyMove) { setUndo(list => [...list.slice(-99), before]); setRedo([]); }
    if (puzzle?.mechanics === "swap") animateSwap(before, points);
    const next = { ...s, points, moves: s.moves + 1 }; update(next); persist(next); finish(next);
  }
  function chooseSwap(index: number) {
    const s = current.current; if (!s || s.done || pausedRef.current || flight.current || puzzle?.mechanics !== "swap") return;
    started.current = true;
    const first = swapChoice.current;
    if (first === index) { clearSwap(); setSelected(null); return; }
    if (first === null) { swapChoice.current = index; setSwapSelection(index); setSelected(index); return; }
    commit(swapNodes(s.points, first, index), clone(s.points));
    if (!current.current?.done) setSelected(index);
  }
  function selectMechanics(next: PuzzleMechanics) {
    const done = next === "swap" ? progress.hardCampaign ?? [] : progress.campaign;
    if (mode === "daily") load(dailySeed(moscowDay(), next), "daily", moscowDay());
    else if (mode === "free") load(formatSeed(level, crypto.getRandomValues(new Uint32Array(1))[0], next), "free");
    else load(campaignSeed(Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).find(n => !done.includes(n)) ?? 1, next), "campaign");
  }
  function openNewFigures() {
    if (!session || !puzzle) return;
    const seed = session.mode === "campaign" ? campaignSeed(puzzle.level, "swap")
      : session.mode === "daily" && session.day ? dailySeed(session.day, "swap")
        : formatSeed(puzzle.level, parseSeed(puzzle.seed)!.code, "swap");
    load(seed, session.mode, session.day);
  }
  function pointAt(event: PointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.round(Math.max(45, Math.min(955, (event.clientX - rect.left) / rect.width * 1000))), y: Math.round(Math.max(45, Math.min(955, (event.clientY - rect.top) / rect.height * 1000))) };
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    const s = current.current; if (!s || s.done || paused || flight.current || drag.current || event.button !== 0) return;
    const point = pointAt(event), nearest = s.points.map((p, id) => ({ id, d: Math.hypot(point.x - p.x, point.y - p.y) })).sort((a, b) => a.d - b.d)[0];
    const radius = Math.max(34, 25 * 1000 / event.currentTarget.getBoundingClientRect().width);
    if (!nearest || nearest.d > radius) return;
    if (puzzle?.mechanics === "swap") { event.preventDefault(); chooseSwap(nearest.id); return; }
    started.current = true;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(nearest.id);
    drag.current = { id: nearest.id, pointer: event.pointerId, before: clone(s.points), start: point };
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const d = drag.current, s = current.current; if (!d || d.pointer !== event.pointerId || !s) return;
    const p = pointAt(event), initial = d.before[d.id];
    const points = s.points.map((old, i) => i === d.id ? { x: Math.max(45, Math.min(955, initial.x + p.x - d.start.x)), y: Math.max(45, Math.min(955, initial.y + p.y - d.start.y)) } : old);
    update({ ...s, points });
  }
  function pointerEnd(event: PointerEvent<SVGSVGElement>, cancelled = false) {
    const d = drag.current, s = current.current; if (!d || d.pointer !== event.pointerId || !s) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) { const restored = { ...s, points: d.before }; update(restored); persist(restored); } else commit(s.points, d.before);
  }
  function keyMove(event: KeyboardEvent<SVGGElement>, index: number) {
    if (flight.current) { if (["Enter", " ", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault(); return; }
    if (puzzle?.mechanics === "swap") {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseSwap(index); }
      else if (event.key === "Escape") { event.preventDefault(); clearSwap(); setSelected(null); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); const next = (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + puzzle.initial.length) % puzzle.initial.length;
        svg.current?.querySelector<SVGGElement>(`[data-node="${next}"]`)?.focus();
      }
      return;
    }
    const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const d = delta[event.key], s = current.current; if (!d || !s || s.done || paused) return;
    started.current = true;
    event.preventDefault(); const step = event.shiftKey ? 5 : 20;
    commit(s.points.map((p, i) => i === index ? { x: Math.max(45, Math.min(955, p.x + d.x * step)), y: Math.max(45, Math.min(955, p.y + d.y * step)) } : p), clone(s.points));
  }
  function showHint() {
    const s = current.current; if (!s || !puzzle || s.done || paused || flight.current) return;
    if (puzzle.mechanics === "swap") {
      const pair = findSwapHint(puzzle, s.points); if (!pair) return;
      clearSwap(); setSwapHint(pair); setSelected(null);
      const next = { ...s, hints: s.hints + 1 }; update(next); persist(next); return;
    }
    const index = s.points.map((p, id) => ({ id, d: Math.hypot(p.x - puzzle.solution[id].x, p.y - puzzle.solution[id].y) })).sort((a, b) => b.d - a.d)[0].id;
    setHint(index); setSelected(index); const next = { ...s, hints: s.hints + 1 }; update(next); persist(next);
  }
  async function share(result = false) {
    if (!session || !puzzle) return;
    const url = new URL(`/${lang}/untangle/`, location.origin); url.searchParams.set("nest", session.seed); if (session.mode === "daily" && session.day) url.searchParams.set("day", session.day);
    const text = result ? `${title}${hard ? ru ? " · Хардмод" : " · Hardmode" : ""} · ${ru ? "Уровень" : "Level"} ${puzzle.level}\n${session.moves} ${ru ? plural(session.moves, ["ход", "хода", "ходов"]) : session.moves === 1 ? "move" : "moves"} · ${time(session.seconds)} · ${session.hints ? `${session.hints} ${ru ? plural(session.hints, ["подсказка", "подсказки", "подсказок"]) : session.hints === 1 ? "hint" : "hints"}` : ru ? "без подсказок" : "no hints"}\n${ru ? "Верните кладке Яй Ци" : "Restore the clutch’s Egg Qi"}: ${url.href}` : `${title} · ${session.seed}\n${url.href}`;
    try {
      if (navigator.share) await navigator.share({ title, text, url: url.href });
      else { await navigator.clipboard.writeText(text); setMessage(ru ? "Ссылка на ту же кладку скопирована." : "Link to the same clutch copied."); }
    } catch (error) { if ((error as Error)?.name !== "AbortError") { setShareLink(text); setMessage(ru ? "Скопируйте вызов из поля ниже." : "Copy the challenge from the field below."); } }
  }

  return <section className="egg-nest" aria-label={title}>
    <header className="nest-heading"><div><p className="nest-eyebrow">{ru ? "Практика тихой формы · V" : "The practice of quiet form · V"}</p><h2>{title}</h2><p>{ru ? "Распутайте белковые нити. Верните кладке Яй Ци." : "Untangle the albumen threads. Restore the clutch’s Egg Qi."}</p></div><span className="nest-seal" aria-hidden="true"><i /></span></header>
    <PortalPresence lang={lang} />
    <GuestNestResults lang={lang} />
    <div className="nest-rules" role="group" aria-label={ru ? "Правила перемещения" : "Movement rules"}>
      {(["drag", "swap"] as const).map(rule => <button key={rule} type="button" disabled={!ready} aria-pressed={mechanics === rule} onClick={() => selectMechanics(rule)}><strong>{rule === "drag" ? ru ? "Обычный" : "Classic" : ru ? "Хардмод" : "Hardmode"}</strong><span>{rule === "drag" ? ru ? "Свободное движение" : "Free movement" : ru ? "Обмен местами" : "Swap positions"}</span></button>)}
    </div>
    <div className="nest-modes" role="group" aria-label={ru ? "Режим игры" : "Game mode"}>
      {(["campaign", "daily", "free"] as const).map((m, i) => <button key={m} type="button" aria-pressed={mode === m} disabled={!ready} onClick={() => { setMode(m); if (m === "daily") load(dailySeed(moscowDay(), mechanics), m, moscowDay()); if (m === "campaign") load(campaignSeed(Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).find(n => !completed.includes(n)) ?? 1, mechanics), m); }}>{(ru ? ["Путь адепта", "Кладка дня", "По сиду"] : ["Adept’s path", "Daily clutch", "Seed challenge"])[i]}</button>)}
    </div>
    <div className="nest-select">
      {mode === "campaign" ? <><div className="nest-select-label"><span>{ru ? "24 ступени к Великому Куполу" : "24 steps to the Great Dome"}</span><strong>{completed.length} / 24</strong></div><div className="nest-levels">{Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).map(n => <button type="button" key={n} title={nestStory(lang, n)[0]} disabled={!ready} aria-label={`${ru ? "Уровень" : "Level"} ${n}${completed.includes(n) ? ru ? ", пройден" : ", complete" : ""}`} aria-pressed={session?.mode === "campaign" && session.seed === campaignSeed(n, mechanics)} className={completed.includes(n) ? "is-complete" : ""} onClick={() => load(campaignSeed(n, mechanics), "campaign")}>{n}<span aria-hidden="true">{completed.includes(n) ? "✓" : "·"}</span></button>)}</div></> : mode === "daily" ? <div className="nest-daily"><span>◌</span><div><strong>{ru ? hard ? "Общая кладка дня · хардмод" : "Одна кладка для всех адептов" : hard ? "Daily clutch · hardmode" : "One clutch for every adept"}</strong><p>{session?.mode === "daily" ? session.day : today} · {ru ? "Новая в 00:00 по Москве" : "Renews at 00:00 Moscow time"}</p>{session?.day !== today && <button type="button" onClick={() => load(dailySeed(moscowDay(), mechanics), "daily", moscowDay())}>{ru ? "Открыть сегодняшнюю" : "Open today’s clutch"}</button>}</div></div> : <form className="nest-seed-form" onSubmit={event => { event.preventDefault(); const seed = parseSeed(code); if (seed) { let day: string | null = null; try { day = new URL(code).searchParams.get("day"); } catch { /* A plain seed has no daily context. */ } const daily = matchesDaily(day, seed.seed); load(seed.seed, daily ? "daily" : isCampaignSeed(seed.seed) ? "campaign" : "free", daily && day ? day : undefined); } else setMessage(ru ? "Нужен код вида NEST2-8-ABC, KNOT3-8-ABC или ссылка на кладку." : "Use a NEST2-8-ABC or KNOT3-8-ABC code, or a clutch link."); }}><label>{ru ? "Код кладки или ссылка" : "Clutch code or link"}<input value={code} onChange={e => setCode(e.target.value)} maxLength={2048} placeholder={hard ? "KNOT3-8-ABC" : "NEST2-8-ABC"} spellCheck={false} /></label><button type="submit">{ru ? "Открыть" : "Open"}</button><label>{ru ? "Сложность" : "Difficulty"}<select value={level} onChange={e => setLevel(Number(e.target.value))}>{Array.from({ length: LEVEL_COUNT }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label><button type="button" onClick={() => load(formatSeed(level, crypto.getRandomValues(new Uint32Array(1))[0], mechanics), "free")}>{ru ? "Новая кладка" : "New clutch"}</button></form>}
    </div>
    {!ready || !session || !puzzle || !analysis ? <p role="status" className="nest-loading">{ru ? "Халазы обретают форму…" : "The chalazae are taking shape…"}</p> : <>
      <div className="nest-chapter"><div><small>{puzzle.version === "NEST1" ? ru ? "АРХИВ ПЕРВОЙ КЛАДКИ" : "FIRST CLUTCH ARCHIVE" : isTutorialSeed(puzzle.seed) ? ru ? "ПЕРВЫЕ ШАГИ" : "FIRST STEPS" : chapter} · {puzzle.level.toString().padStart(2, "0")}</small><h3>{session.mode === "campaign" && puzzle.version !== "NEST1" ? story[0] : session.mode === "daily" ? ru ? "Кладка дня" : "Daily clutch" : ru ? "Свободная форма" : "Free form"}</h3></div></div>
      {session.mode === "campaign" && puzzle.version !== "NEST1" && <p className="nest-story">{story[1]}</p>}
      {puzzle.version === "NEST1" && <p className="nest-story">{ru ? "Это прежняя версия кладки. Её раскладка и рекорды сохранены. Новый путь адепта — в уровнях выше." : "This is an earlier clutch. Its layout and records are preserved. The new adept’s path is available in the levels above."}</p>}
      {puzzle.version === "KNOT1" && <div className="nest-archive"><p>{ru ? "Вы продолжаете прежнюю раскладку. В обновлённом хардмоде появились новые формы и отдельные фигуры." : "You are continuing an earlier layout. The updated hardmode has new shapes and separate figures."}</p><button type="button" onClick={openNewFigures}>{ru ? "Открыть новые фигуры" : "Open new shapes"}</button></div>}
      <p className="nest-controls">{hard ? ru ? "Нажмите на яйцо, затем на другое — они поменяются местами. Распутайте все нити; отдельные фигуры тоже подходят." : "Select an egg, then another to swap them. Uncross every thread; separate shapes are valid too." : ru ? "Перетаскивайте яйца, пока нити не перестанут пересекаться." : "Drag the eggs until no threads cross."}</p>
      <div className="nest-metrics"><div><strong className={analysis.crossings ? "is-tangled" : ""}>{analysis.crossings}</strong><span>{ru ? plural(analysis.crossings, ["пересечение", "пересечения", "пересечений"]) : "crossings"}</span></div><div><strong>{session.moves}</strong><span>{ru ? plural(session.moves, ["ход", "хода", "ходов"]) : session.moves === 1 ? "move" : "moves"}</span></div><div><strong>{time(session.seconds)}</strong><span>{ru ? "время" : "time"}</span></div><div><strong>{Math.round(100 * Math.max(0, 1 - analysis.crossedEdges.length / puzzle.edges.length))}%</strong><span>{ru ? "Яй Ци" : "Egg Qi"}</span></div></div>
      <div aria-busy={animating} className={`nest-board${showResult ? " is-solved" : ""}${hard ? " is-hard" : ""}${animating ? " is-swapping" : ""}`}>
        <svg ref={svg} viewBox="0 0 1000 1000" role="group" aria-label={hard ? ru ? "Кладка: выберите два яйца для обмена местами" : "Clutch: select two eggs to swap their positions" : ru ? "Кладка: перемещайте яйца, пока нити не перестанут пересекаться" : "Clutch: move the eggs until no threads cross"} aria-describedby={`${uid}-instructions`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={event => pointerEnd(event, true)}>
          <defs><radialGradient id={`${uid}-shell`} cx="35%" cy="25%" r="80%"><stop stopColor="#fffcec"/><stop offset=".58" stopColor="#f4dfb0"/><stop offset="1" stopColor="#bb854d"/></radialGradient></defs>
          {!hard && <><ellipse cx="500" cy="500" rx="415" ry="440" className="nest-orbit"/><ellipse cx="500" cy="500" rx="340" ry="365" className="nest-orbit nest-orbit-inner"/></>}
          <text x="500" y="488" className="nest-watermark">{ru ? "КУЛЬТУРА" : "CULTURE"}</text><text x="500" y="531" className="nest-watermark-sub">{ru ? "ЯЙЦА" : "OF THE EGG"}</text>
          {puzzle.slots?.map((p, i) => <path key={`slot-${i}`} d={EGG_OUTLINE} transform={`translate(${p.x} ${p.y}) scale(1.3)`} className="nest-slot" aria-hidden="true"/>)}
          {puzzle.edges.map(([a, b], i) => <g key={i} className={`nest-thread${analysis.crossedEdges.includes(i) ? " is-crossed" : ""}${activeNode === a || activeNode === b ? " is-connected" : ""}${hard && swapSelection !== null && swapSelection !== a && swapSelection !== b ? " is-muted" : ""}`}><line x1={viewPoints[a].x} y1={viewPoints[a].y} x2={viewPoints[b].x} y2={viewPoints[b].y} className="nest-thread-shadow"/><line x1={viewPoints[a].x} y1={viewPoints[a].y} x2={viewPoints[b].x} y2={viewPoints[b].y} className="nest-thread-core"/></g>)}
          {swapHint && <g className="nest-hint" aria-hidden="true"><line x1={viewPoints[swapHint[0]].x} y1={viewPoints[swapHint[0]].y} x2={viewPoints[swapHint[1]].x} y2={viewPoints[swapHint[1]].y}/></g>}
          {hint !== null && <g className="nest-hint" aria-hidden="true"><line x1={viewPoints[hint].x} y1={viewPoints[hint].y} x2={puzzle.solution[hint].x} y2={puzzle.solution[hint].y}/><path d={EGG_OUTLINE} transform={`translate(${puzzle.solution[hint].x} ${puzzle.solution[hint].y})`}/><text x={puzzle.solution[hint].x} y={puzzle.solution[hint].y + 7}>{hint + 1}</text></g>}
          {viewPoints.map((p, i) => <g key={i} data-node={i} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={session.done || paused || animating ? -1 : 0} aria-disabled={session.done || paused || animating} aria-pressed={hard ? swapSelection === i : undefined} aria-label={`${ru ? "Яйцо" : "Egg"} ${i + 1}, ${ru ? "связей" : "connections"}: ${puzzle.edges.filter(([a, b]) => a === i || b === i).length}. ${hard ? ru ? "Enter или пробел — выбрать для обмена" : "Enter or Space to select for a swap" : ru ? "Стрелки — переместить" : "Arrow keys to move"}`} className={`nest-egg${motion?.moving.includes(i) ? " is-swapping" : ""}${activeNode === i ? " is-selected" : ""}${swapHint?.includes(i) ? " is-hint" : ""}${analysis.overlappingNodes.some(pair => pair.includes(i)) || analysis.blockedNodes.includes(i) ? " is-blocked" : ""}`} onFocus={() => setSelected(i)} onKeyDown={event => keyMove(event, i)}><circle r="39" fill="transparent"/><path className="nest-egg-halo" d={EGG_OUTLINE} transform="scale(1.25)"/><path className="nest-egg-shell" d={EGG_OUTLINE} fill={`url(#${uid}-shell)`}/><text y="12">{i + 1}</text><ellipse cx="-7" cy="-15" rx="3" ry="7" transform="rotate(22 -7 -15)" fill="#fffef5" opacity=".65"/></g>)}
        </svg>
        {paused && <div className="nest-pause"><span>◌</span><h3>{ru ? "Кладка отдыхает" : "The clutch is resting"}</h3><button type="button" onClick={() => { setPaused(false); pausedRef.current = false; }}>{ru ? "Продолжить ритуал" : "Continue the ritual"}</button></div>}
      </div>
      <p className="nest-feedback" role="status" aria-live="polite">{animating ? ru ? "Яйца меняются местами…" : "The eggs are swapping places…" : showResult ? ru ? "Нити свободны. Кладка обрела покой." : "The threads are free. The clutch is at peace." : swapHint ? ru ? `Поменяйте местами яйца ${swapHint[0] + 1} и ${swapHint[1] + 1}. Это шаг к одной из свободных форм.` : `Swap eggs ${swapHint[0] + 1} and ${swapHint[1] + 1}. This is a step towards one untangled form.` : swapSelection !== null ? ru ? `Яйцо ${swapSelection + 1} выбрано. Нажмите на другое для обмена или на него же, чтобы снять выбор.` : `Egg ${swapSelection + 1} selected. Choose another to swap, or select it again to cancel.` : analysis.overlappingNodes.length ? ru ? "Разведите яйца: каждому нужно своё место." : "Separate the eggs: each needs its own space." : hint !== null ? ru ? `Призрачная скорлупа — одно из возможных мест для яйца ${hint + 1}. На пути к решению пересечений может стать больше.` : `The ghost shell is one possible place for egg ${hint + 1}. Crossings may increase on the way to a solution.` : analysis.blockedNodes.length && !analysis.crossings ? ru ? "Пересечений не видно, но часть нитей скрыта за яйцами. Освободите их." : "No crossings are visible, but some threads are hidden behind eggs. Give them room." : ru ? "Распутайте выделенные нити, чтобы они не пересекались." : "Untangle the highlighted threads so that none cross."}</p>
      {showResult ? <div className="nest-result" role="status"><p className="nest-eyebrow">{ru ? "Ритуал завершён" : "Ritual complete"}</p><h3>{ru ? "Хранитель тихой кладки" : "Keeper of the quiet clutch"}</h3><p>{session.moves} {ru ? plural(session.moves, ["ход", "хода", "ходов"]) : session.moves === 1 ? "move" : "moves"} · {time(session.seconds)} · {session.hints ? `${session.hints} ${ru ? plural(session.hints, ["подсказка", "подсказки", "подсказок"]) : session.hints === 1 ? "hint" : "hints"}` : ru ? "Без подсказок" : "No hints"}</p><div className="nest-actions"><button className="nest-primary" type="button" onClick={() => void share(true)}>{ru ? "Поделиться результатом" : "Share result"}</button>{session.mode === "campaign" && puzzle.level < 24 && <button type="button" onClick={() => load(nextCampaignSeed(puzzle.seed)!, "campaign")}>{ru ? "Следующая ступень →" : "Next step →"}</button>}<button type="button" onClick={() => load(session.seed, session.mode, session.day, true)}>{ru ? "Пройти ещё раз" : "Play again"}</button></div>{session.ticket.owner ? <ResultSync lang={lang} owner={session.ticket.owner}/> : <p>{durable ? ru ? "Результат сохранён в этом браузере. После входа его можно добавить в профиль." : "Your result is saved in this browser. Sign in to add it to your profile." : ru ? "Браузер запретил хранение. Результат доступен только в этой вкладке — поделитесь им перед закрытием." : "Browser storage is blocked. This result lasts only in this tab — share it before closing."} {durable && <a href={`/${lang}/profile/#nest-results`}>{ru ? "Войти и сохранить результат →" : "Sign in and save result →"}</a>}</p>}</div> : <div className="nest-actions"><button type="button" disabled={!undo.length || paused || animating || session.done} onClick={() => { const points = undo.at(-1); if (!points || !current.current || flight.current) return; const before = clone(current.current.points); setRedo(list => [...list, before]); setUndo(list => list.slice(0, -1)); commit(points, before, true); }}>{ru ? "↶ Отменить" : "↶ Undo"}</button><button type="button" disabled={!redo.length || paused || animating || session.done} onClick={() => { const points = redo.at(-1); if (!points || !current.current || flight.current) return; const before = clone(current.current.points); setUndo(list => [...list, before]); setRedo(list => list.slice(0, -1)); commit(points, before, true); }}>{ru ? "↷ Вернуть" : "↷ Redo"}</button><button type="button" onClick={showHint} disabled={paused || animating || session.done}>{ru ? "Подсказка" : "Hint"}{session.hints > 0 ? ` · ${session.hints}` : ""}</button><button type="button" disabled={session.done} onClick={() => { settleMotion(); cancelCurrentDrag(); const value = !paused; setPaused(value); pausedRef.current = value; }}>{paused ? ru ? "Продолжить" : "Resume" : ru ? "Пауза" : "Pause"}</button><button type="button" onClick={() => { if (session.moves === 0 || window.confirm(ru ? "Начать эту кладку заново? Текущая раскладка будет сброшена." : "Restart this clutch? Your current layout will be reset.")) load(session.seed, session.mode, session.day, true); }}>{ru ? "Сначала" : "Restart"}</button></div>}
      <div className="nest-footer"><span>{puzzle.initial.length} {ru ? plural(puzzle.initial.length, ["яйцо", "яйца", "яиц"]) : "eggs"} · {puzzle.edges.length} {ru ? plural(puzzle.edges.length, ["халаза", "халазы", "халаз"]) : "chalazae"}{hard && groups.length > 1 && <> · {groups.length} {ru ? plural(groups.length, ["отдельная фигура", "отдельные фигуры", "отдельных фигур"]) : "separate shapes"}</>}</span><button type="button" onClick={() => void share()} aria-label={ru ? "Поделиться этой кладкой" : "Share this clutch"}>{session.seed} ↗</button></div>
      {best && <div className="nest-best"><p>{ru ? "Ваши лучшие результаты на этой кладке" : "Your best results for this clutch"}</p><dl><div><dt>{ru ? "Меньше всего ходов" : "Fewest moves"}</dt><dd>{best.moves}</dd></div><div><dt>{ru ? "Лучшее время" : "Fastest time"}</dt><dd>{time(best.seconds)}</dd></div></dl><p>{ru ? "Рекорд по ходам и рекорд по времени могут быть установлены в разных партиях." : "The move record and time record may come from different attempts."}</p></div>}
    </>}
    {message && <p className="nest-message" role="status">{message}</p>}
    {shareLink && <textarea className="nest-share-fallback" aria-label={ru ? "Вызов для копирования" : "Challenge to copy"} readOnly value={shareLink} onFocus={e => e.currentTarget.select()}/>}
    {!durable && !session?.done && <p className="nest-message">{ru ? "Хранение в браузере недоступно. Оставьте вкладку открытой до завершения; результат аккаунта отправится при наличии связи." : "Browser storage is unavailable. Keep this tab open until completion; account results sync when connected."}</p>}
    <details className="nest-help"><summary>{ru ? "Искусство распутывания" : "The art of untangling"}</summary><div id={`${uid}-instructions`}>
      <p>{ru ? "Халазы — белковые нити, удерживающие желток. В этой кладке они спутались: распутайте нити, сохранив их соединения. Любая раскладка без пересечений подходит, в том числе несколько отдельных фигур." : "Chalazae are albumen threads that hold the yolk. This clutch’s threads are tangled: uncross them without changing their connections. Any untangled layout works, including several separate shapes."}</p>
      <p>{hard ? ru ? "Хардмод: яйца стоят в фиксированных гнёздах. Нажмите на одно яйцо, затем на второе — они поменяются местами. Повторное нажатие снимает выбор. С клавиатуры: Tab или стрелки выбирают яйцо, Enter или пробел подтверждают, Escape снимает выбор." : "Hardmode: eggs occupy fixed nests. Select one egg, then another to swap them. Select the same egg to cancel. Keyboard: Tab or arrows focus an egg, Enter or Space selects it, Escape cancels." : ru ? "Тяните яйцо мышью или пальцем. Клавиатура: Tab выбирает яйцо, стрелки двигают его, Shift + стрелка — точный шаг. Оставляйте между яйцами место, чтобы все нити были видны." : "Drag an egg with your mouse or finger. Keyboard: Tab selects an egg, arrows move it, Shift + arrow makes a fine step. Leave space between eggs so that every thread is visible."}</p>
      <p>{ru ? "Полезный ход иногда добавляет пересечения. Подсказка показывает шаг к одной из возможных свободных форм. Отмена и возврат тоже считаются ходами; подсказки отмечаются в результате. Время идёт с первого прикосновения к яйцу и останавливается на паузе, при скрытии вкладки или выходе из игры." : "A useful move may temporarily add crossings. A hint shows a step towards one possible untangled form. Undo and redo also count as moves; hints are noted in your result. Time starts with your first touch of an egg and stops on pause, when the tab is hidden or when you leave the game."}</p>
      <p>{ru ? "Незаконченная партия хранится в этом браузере отдельно для каждого аккаунта. Завершённые уровни, рекорды и достижения синхронизируются через профиль. Можно пройти кладку гостем, затем войти и нажать «Сохранить в профиль». Игра предложит перенести гостевые результаты из этого браузера в выбранный аккаунт." : "Unfinished puzzles stay in this browser separately for each account. Completed levels, personal bests and achievements sync through your profile. You can finish as a guest, sign in later and choose “Save to profile” to add this browser’s guest results to the selected account."}</p>
    </div></details>
  </section>;
}
