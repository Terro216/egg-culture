import { useEffect, useState } from "react";
import type { PopularFilter, PopularRoads as PopularRoadsData } from "./leaderboard.ts";
import { parseRoadCode } from "./seed.ts";
import { copy } from "./copy.ts";

export function PopularRoads({ lang, ready, onChoose }: {
  lang: "ru" | "en"; ready: boolean; onChoose: (code: string) => void;
}) {
  const ui = copy[lang];
  const [filter, setFilter] = useState<PopularFilter>("all"), [revision, setRevision] = useState(0);
  const [data, setData] = useState<PopularRoadsData | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); let live = true;
    const timer = setTimeout(() => abort.abort(), 8000);
    setData(null); setFailed(false);
    void fetch(`/api/egg-road-records?view=popular&mode=${filter}`, { signal: abort.signal, credentials: "same-origin" })
      .then(async response => { if (!response.ok) throw new Error(); return await response.json() as PopularRoadsData; })
      .then(value => { if (live && value.filter === filter) setData(value); })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); abort.abort(); };
  }, [filter, revision]);
  return <div className="egg-road-popular">
    <p className="egg-road-intro">{ui.popularNote}</p>
    <div className="egg-road-filters" role="group" aria-label={ui.popularFilter}>
      {([ ["all", ui.popularAll], ["finite", ui.popularFinite], ["endless", ui.popularEndless] ] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
    </div>
    {failed ? <p role="status">{ui.popularError} <button type="button" className="egg-road-popular-retry" onClick={() => setRevision(value => value + 1)}>{ui.tryAgain}</button></p>
      : !data || data.filter !== filter ? <p role="status">{ui.popularLoading}</p>
      : !data.tracks.length ? <p role="status">{ui.popularEmpty}</p>
      : <ol className="egg-road-popular-list">{data.tracks.map(road => {
        const spec = parseRoadCode(road.code);
        const title = spec?.mode === "endless" ? `∞ ${ui.endless}` : spec?.level === 1 ? ui.tutorial : `${ui.level} ${spec?.level}`;
        return <li key={road.code}><button type="button" disabled={!ready} onClick={() => onChoose(road.code)} aria-label={`${ui.popularPlay}: ${title}, ${road.code}`}>
          <span className="egg-road-popular-title"><strong>{title}</strong><span>{ui.popularPlay} ↗</span></span>
          <code>{road.code}</code>
          <span className="egg-road-popular-stats"><span>{ui.popularPlayers}: <b>{road.players.toLocaleString(lang)}</b></span><span>{ui.popularBest}: {road.bestScore.toLocaleString(lang)}</span></span>
        </button></li>;
      })}</ol>}
    {!ready && <p role="status">{ui.loading}</p>}
  </div>;
}
