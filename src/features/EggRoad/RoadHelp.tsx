import { copy } from "./copy.ts";
import { scoreRules } from "./rules.ts";
import type { RoadVersion } from "./rules.ts";

export function RoadHelp({ lang, version }: { lang: "ru" | "en"; version: RoadVersion }) {
  const ui = copy[lang], r = scoreRules(version), ru = lang === "ru";
  const rules = ru ? [
    `Отметка: +${r.gate} очков`, `Край дороги: +${r.edge} за метр`,
    `Скорость от 83 км/ч: до +${r.speed} за метр`, `Ритм от двух перекатов: +${r.rhythm} × серия за метр, до +${r.rhythm * r.rhythmCap}`,
    `Падение от 12 м: +${r.drop} за метр высоты после приземления`, `Срезка: +${r.shortcut} за пропущенную отметку`,
  ] : [
    `Gate: +${r.gate} points`, `Road edge: +${r.edge} per metre`,
    `Speed from 83 km/h: up to +${r.speed} per metre`, `Rhythm from two strokes: +${r.rhythm} × chain per metre, up to +${r.rhythm * r.rhythmCap}`,
    `Drop of 12 m or more: +${r.drop} per metre of height after landing`, `Shortcut: +${r.shortcut} per skipped gate`,
  ];
  return <details className="egg-road-help"><summary>{ui.help}</summary><p>{ui.controls}</p><p>{ui.keyboard}</p><p>{ui.lookHint}</p>
    <p>{version >= 3 ? ui.rhythmDynamicHelp : ui.rhythmHelp}</p><p>{ui.jumpHelp}</p><p>{ui.flightHelp}</p><ul>{rules.map(rule => <li key={rule}>{rule}</li>)}</ul><p>{ui.fairRule}</p></details>;
}
