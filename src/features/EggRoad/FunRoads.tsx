import { FUN_ROADS } from "./funRoads.ts";
import type { RoadSpec } from "./seed.ts";
import { roadCode } from "./seed.ts";

export function FunRoads({ lang, ready, onChoose, completed = [] }: { lang: "ru" | "en"; ready: boolean; onChoose: (spec: RoadSpec) => void; completed?: string[] }) {
  const done = new Set(completed), count = FUN_ROADS.filter(road => done.has(roadCode(road.spec))).length;
  return <details className="egg-road-help egg-road-fun">
    <summary>{lang === "ru" ? "Прикольные трассы" : "Fun roads"}</summary>
    <p className="egg-road-fun-progress">{lang === "ru" ? `Испытатель дорог · Пройдено ${count}/${FUN_ROADS.length}` : `Road explorer · Finished ${count}/${FUN_ROADS.length}`}</p>
    <ul className="egg-road-fun-list">{FUN_ROADS.map(road => <li key={`${road.spec.mode}-${road.spec.seed}`}>
      <button type="button" disabled={!ready} onClick={() => onChoose(road.spec)}>
        <svg viewBox="0 0 56 48" aria-hidden="true"><path d={road.shape} /></svg>
        <span><strong>{road[lang].title}</strong><small>{road[lang].hint}</small></span>
        {done.has(roadCode(road.spec)) ? <span role="img" aria-label={lang === "ru" ? "Пройдена" : "Finished"}>✓</span> : <span aria-hidden="true">↗</span>}
      </button>
    </li>)}</ul>
  </details>;
}
