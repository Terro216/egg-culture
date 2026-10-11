import type { IncubatorState } from "../Incubator/rules.ts";
import { FRY_SEASON } from "../EggFry/rules.ts";
import { parseSeed } from "../EggUntangle/engine.ts";
export type PortalGame = "road" | "fry" | "chalaza" | "oracle" | "untangle";
export type UntangleResult = {
  seed: string; level: number; mode: "campaign" | "daily" | "free"; day?: string;
  moves: number; hints: number; positions: { x: number; y: number }[];
};
export type UntanglePuzzleRecord = Omit<UntangleResult, "positions"> & { seconds: number; solves: number };
export type UntangleProgress = {
  campaignVersion: 2;
  campaign: number[]; hardCampaign: number[]; legacyCampaign: number[];
  puzzles: UntanglePuzzleRecord[]; totalSolved: number; hardSolved: number;
  dailySolved: number; dailyStreak: number; bestDailyStreak: number;
};
export type PortalRun = {
  id: string; game: PortalGame; score: string; seconds: number; peak: string;
  sector: number; losses: number; jackpot: boolean; dodged: number; swaps: number; season?: 2 | 3; roadRules?: 1 | 2;
  untangle?: UntangleResult;
  /** Explicit transfer of a completed guest puzzle; never set for automatic sync. */
  guestImport?: true;
};
export type PortalStat = { game: PortalGame; best: string; runs: number; roadRules?: 2; solved?: number; completedLevels?: number; hardSolved?: number; hardCompletedLevels?: number; legacyCompletedLevels?: number; dailySolved?: number; dailyStreak?: number };
export type PublicProfile = { id: string; name: string; avatar: number; stats: PortalStat[]; achievements: string[]; achievementRarity: Record<string, number>; frySeason?: 2 | 3; classicRoadBest?: string };
export type OwnProfile = PublicProfile & { public: boolean; slug: string | null; initiated?: boolean; incubator?: IncubatorState | null; untangle?: UntangleProgress };
export type PortalAccount = { name: string; registered: boolean };
export const GAME_NAMES = {
  ru: { road: "Путь формы", fry: "Великая Жарка · III", chalaza: "Халаза-тест", oracle: "Оракул желтка", untangle: "Халазы судьбы" },
  en: { road: "Path of Form", fry: "The Great Fry · III", chalaza: "The Chalaza Test", oracle: "Oracle of the Yolk", untangle: "Chalazae of Fate" },
} as const;
export const AVATARS = ["🥚", "🍳", "🐣", "🪺", "🌗", "✦"];
export const ACHIEVEMENTS = {
  "fry.one": ["Единственное и достаточное", "One is sufficient", "Доставить ровно одно яйцо", "Deliver exactly one egg", "Ⅰ"],
  "fry.thousand": ["Тысяча допущена", "A thousand admitted", "Доставить 1 000 яиц", "Deliver 1,000 eggs", "Ⅿ"],
  "fry.million": ["Миллионная кладка", "A million in the clutch", "Собрать миллион яиц за забег", "Reach a million eggs in one run", "∞"],
  "fry.jackpot": ["Двадцатикратное увеличение", "Twentyfold expansion", "Пройти ворота ×20", "Pass through a ×20 gate", "×20"],
  "fry.clean": ["Кладка без потерь", "Clutch without losses", "Завершить жарку без потерь", "Complete a delivery without losses", "◇"],
  "fry.dodger": ["Пять инструментов мимо", "Five tools avoided", "Полностью обойти пять ловушек за забег", "Completely dodge five hazards in one run", "↝"],
  "fry.risk": ["Пятый участок", "The fifth section", "Добраться до пятого участка", "Reach the fifth section", "Ⅴ"],
  "fry.switcher": ["Смена курса", "Change of course", "Пройти пять меняющихся ворот за забег", "Pass five switching gates in one run", "⇄"],
  "road.first": ["След на дороге", "A mark on the road", "Набрать первые очки в Пути формы", "Score your first points in Path of Form", "↗"],
  "road.thousand": ["Дорога приняла", "The road accepts", "Набрать 1 000 очков в Пути формы", "Score 1,000 points in Path of Form", "↟"],
  "road.explorer": ["Испытатель дорог", "Road explorer", "Финишировать на всех шести прикольных трассах", "Finish all six fun roads", "♧"],
  "chalaza.complete": ["Центр удержан", "Centre held", "Пройти Халаза-тест", "Complete the Chalaza Test", "⊙"],
  "oracle.complete": ["Ответ услышан", "Answer received", "Завершить обращение к Оракулу", "Complete an Oracle reading", "◉"],
  "untangle.first": ["Первая нить порядка", "The first thread of order", "Распутать первую кладку в Халазах судьбы", "Untangle your first clutch in Chalazae of Fate", "⌘"],
  "untangle.clean": ["Без вмешательства Совета", "Without the Council's help", "Распутать кладку без подсказок", "Untangle a clutch without hints", "◇"],
  "untangle.master": ["Старший хранитель халаз", "Senior keeper of chalazae", "Распутать кладку уровня 12 или выше", "Untangle a clutch at level 12 or above", "Ⅻ"],
  "untangle.campaign": ["Атлас целостной скорлупы", "Atlas of the whole shell", "Пройти все 24 ступени Халаз судьбы", "Complete all 24 stages of Chalazae of Fate", "◎"],
  "untangle.week": ["Семь утренних кладок", "Seven morning clutches", "Распутать семь разных кладок дня", "Untangle seven different daily clutches", "Ⅶ"],
  "untangle.streak": ["Неделя без единого узла", "A week without a knot", "Распутать кладки семи дней подряд", "Untangle seven consecutive daily clutches", "↬"],
  "untangle.hard.first": ["Закон неподвижных гнёзд", "The law of fixed nests", "Распутать первую кладку перестановками яиц", "Untangle your first clutch by swapping eggs", "⇄"],
  "untangle.hard.master": ["Магистр перестановок", "Master of permutations", "Распутать кладку перестановками на уровне 12 или выше", "Untangle a swap-only clutch at level 12 or above", "⧉"],
  "untangle.hard.campaign": ["Совет недвижимой скорлупы", "Council of the still shell", "Пройти все 24 ступени режима перестановок", "Complete all 24 swap-only stages", "✺"],
  "manifesto.scholar": ["Знаток манифеста", "Manifesto scholar", "Провести 4 минуты за чтением Манифеста", "Spend 4 minutes reading the Manifesto", "§"],
  "incubator.start": ["Первая кладка", "First clutch", "Заложить яйцо в Инкубатор", "Lay an egg in the Incubator", "◌"],
  "incubator.day3": ["Третий день", "Third day", "Прогреть яйцо на третий день выдержки", "Warm the egg on its third day", "Ⅲ"],
  "incubator.day7": ["Неделя тепла", "A week of warmth", "Прогреть яйцо после недели выдержки", "Warm the egg after a week of aging", "Ⅶ"],
  "incubator.day14": ["Две недели выдержки", "Two weeks of aging", "Прогреть яйцо после двух недель выдержки", "Warm the egg after two weeks of aging", "ⅩⅣ"],
  "incubator.perfect": ["Совершенное яйцо", "The perfect egg", "Довести яйцо до 30 Яй Ци", "Bring the egg to 30 Egg Qi", "✦"],
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;
export const isAchievement = (id: unknown): id is AchievementId => typeof id === "string" && Object.hasOwn(ACHIEVEMENTS, id);
const integer = (v: unknown, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
export function validatePortalRun(value: unknown): PortalRun | null {
  if (!value || typeof value !== "object") return null;
  const r = value as PortalRun;
  if (typeof r.id !== "string" || !/^[0-9a-f-]{36}$/.test(r.id) || !["road", "fry", "chalaza", "oracle", "untangle"].includes(r.game)) return null;
  if (typeof r.score !== "string" || !/^(0|[1-9]\d{0,511})$/.test(r.score) || typeof r.peak !== "string" || !/^(0|[1-9]\d{0,511})$/.test(r.peak)) return null;
  if (!Number.isFinite(r.seconds) || r.seconds < 0 || r.seconds > 86400 || !integer(r.sector, 10000) || !integer(r.losses, 1000000) || !integer(r.dodged, 100000) || !integer(r.swaps, 100000) || typeof r.jackpot !== "boolean") return null;
  if (BigInt(r.score) > BigInt(r.peak)) return null;
  if (r.game !== "fry" && (BigInt(r.score) > BigInt(r.game === "road" ? 1000000000 : 100) || r.jackpot || r.dodged || r.swaps)) return null;
  if (r.game === "fry" ? r.season !== undefined && r.season !== 2 && r.season !== FRY_SEASON : r.season !== undefined) return null;
  if (r.roadRules !== undefined && (r.game !== "road" || (r.roadRules !== 1 && r.roadRules !== 2))) return null;
  if (r.guestImport !== undefined && (r.game !== "untangle" || r.guestImport !== true)) return null;
  let untangle: UntangleResult | undefined;
  if (r.game === "untangle") {
    const u = r.untangle;
    if (!u || typeof u !== "object" || typeof u.seed !== "string" || u.seed.length > 128 || !u.seed.length || !integer(u.level, 24) || u.level < 1 || !["campaign", "daily", "free"].includes(u.mode)) return null;
    if (!integer(u.moves, 100000) || u.moves < 1 || !integer(u.hints, 100000) || !Array.isArray(u.positions) || u.positions.length < 4 || u.positions.length > 24) return null;
    if (u.positions.some(p => !p || typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1000 || p.y < 0 || p.y > 1000)) return null;
    if (u.mode === "daily" ? typeof u.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(u.day) : u.day !== undefined) return null;
    if (r.score !== String(u.level) || r.peak !== r.score || r.sector !== 0 || r.losses !== 0) return null;
    untangle = { seed: u.seed, level: u.level, mode: u.mode, ...(u.mode === "daily" ? { day: u.day } : {}), moves: u.moves, hints: u.hints, positions: u.positions.map(p => ({ x: p.x, y: p.y })) };
  } else if (r.untangle !== undefined) return null;
  return { id: r.id, game: r.game, score: r.score, peak: r.peak, seconds: r.seconds, sector: r.sector, losses: r.losses, jackpot: r.jackpot, dodged: r.dodged, swaps: r.swaps,
    ...(r.game === "fry" ? { season: r.season ?? 2 } : {}), ...(r.game === "road" && r.roadRules === 2 ? { roadRules: 2 as const } : {}), ...(untangle ? { untangle } : {}), ...(r.guestImport ? { guestImport: true as const } : {}) };
}
export function earnedAchievements(r: PortalRun): AchievementId[] {
  const score = BigInt(r.score);
  if (r.game === "road") return [...(score > 0n ? ["road.first" as const] : []), ...(score >= 1000n ? ["road.thousand" as const] : [])];
  if (r.game === "chalaza" || r.game === "oracle") return score > 0n ? [`${r.game}.complete`] : [];
  if (r.game === "untangle") return r.untangle ? ["untangle.first", ...(r.untangle.hints === 0 ? ["untangle.clean" as const] : []), ...(r.untangle.level >= 12 ? ["untangle.master" as const] : []),
    ...(parseSeed(r.untangle.seed)?.mechanics === "swap" ? ["untangle.hard.first" as const, ...(r.untangle.level >= 12 ? ["untangle.hard.master" as const] : [])] : [])] : [];
  return [
    ...(score === 1n ? ["fry.one" as const] : []), ...(score >= 1000n ? ["fry.thousand" as const] : []),
    ...(BigInt(r.peak) >= 1000000n ? ["fry.million" as const] : []), ...(r.jackpot ? ["fry.jackpot" as const] : []),
    ...(score > 0n && r.losses === 0 ? ["fry.clean" as const] : []), ...(r.dodged >= 5 ? ["fry.dodger" as const] : []),
    ...(r.sector >= 5 ? ["fry.risk" as const] : []), ...(r.swaps >= 5 ? ["fry.switcher" as const] : []),
  ];
}
