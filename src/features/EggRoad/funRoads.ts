import { STRAIGHT_ROAD, roadCode } from "./seed.ts";
import type { RoadSpec } from "./seed.ts";

export const FUN_ROADS = [
  { spec: STRAIGHT_ROAD, shape: "M4 24H52", ru: { title: "Полная прямая", hint: "5 км для скорости и ритма." }, en: { title: "The long straight", hint: "5 km for speed and rhythm." } },
  { spec: { mode: "stunt", version: 3, level: 8, seed: 1 }, shape: "M4 8H20M27 22H52M27 32H52M27 42H52", ru: { title: "Прыжок в три этажа", hint: "Разгонитесь, слетите с края и выберите дорогу ниже." }, en: { title: "Three-deck drop", hint: "Build speed, fly off the edge and choose a road below." } },
  { spec: { mode: "stunt", version: 3, level: 8, seed: 2 }, shape: "M4 39H24C46 39 48 5 29 5C10 5 12 39 34 39H52", ru: { title: "Мёртвая петля", hint: "Наберите ритм перед петлёй и держитесь середины." }, en: { title: "Loop the loop", hint: "Build rhythm before the loop and stay near the centre." } },
  { spec: { mode: "stunt", version: 3, level: 8, seed: 3 }, shape: "M28 4C4 12 52 20 28 28S4 40 28 44", ru: { title: "Слалом", hint: "Каждый изгиб чуть сильнее. Ловите снос заранее." }, en: { title: "Slalom", hint: "Each bend grows stronger. Catch the drift early." } },
  { spec: { mode: "stunt", version: 3, level: 8, seed: 4 }, shape: "M4 12H18L24 20H32L38 12H52M4 36H18L24 28H32L38 36H52", ru: { title: "Узкие мостики", hint: "Четыре сужения для точных поправок курса." }, en: { title: "Narrow bridges", hint: "Four narrow crossings for precise steering." } },
  { spec: { mode: "stunt", version: 3, level: 8, seed: 5 }, shape: "M4 6H12C22 6 32 42 42 38L52 32M2 23H13M2 32H19", ru: { title: "Скоростной обрыв", hint: "Крутой спуск для предельного разгона и длинный выкат." }, en: { title: "Speed plunge", hint: "A steep descent for extreme speed, then a long run-out." } },
] as const satisfies readonly { spec: RoadSpec; shape: string; ru: { title: string; hint: string }; en: { title: string; hint: string } }[];
export const FUN_ROAD_CODES: readonly string[] = FUN_ROADS.map(road => roadCode(road.spec));

export function funRoadCopy(spec: Pick<RoadSpec, "mode" | "seed">, lang: "ru" | "en") {
  return FUN_ROADS.find(road => road.spec.mode === spec.mode && road.spec.seed === spec.seed)?.[lang];
}
