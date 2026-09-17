import { useEffect, useRef, useState } from "react";
import type { RoadResult } from "./simulation.ts";
import type { RoadLeaderboard } from "./leaderboard.ts";
import { copy } from "./copy.ts";

export function useRoadRecords(code: string, result: RoadResult | null) {
  const [data, setData] = useState<RoadLeaderboard | null>(null);
  const [failed, setFailed] = useState(false), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0), [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "error" | "limited">("idle");
  const post = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const edited = useRef(false);
  useEffect(() => {
    try { const value = localStorage.getItem("egg_road_name_v1"); if (value) { setName(value); edited.current = true; } } catch { /* Optional. */ }
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let live = true;
    const requestEpoch = ++epoch.current;
    const timer = setTimeout(() => abort.abort(), 8000);
    setData(null); setFailed(false); setLoading(true);
    void fetch(`/api/egg-road-records?code=${encodeURIComponent(code)}`, { signal: abort.signal, credentials: "same-origin" })
      .then(async response => { if (!response.ok) throw new Error(); return await response.json() as RoadLeaderboard; })
      .then(value => { if (live && epoch.current === requestEpoch && value.code === code) { setData(value); if (!edited.current) setName(value.name); } })
      .catch(() => { if (live && epoch.current === requestEpoch) setFailed(true); })
      .finally(() => { clearTimeout(timer); if (live && epoch.current === requestEpoch) setLoading(false); });
    return () => { live = false; clearTimeout(timer); abort.abort(); };
  }, [code, revision]);
  useEffect(() => { setStatus("idle"); return () => { post.current?.abort(); post.current = null; }; }, [result, code]);
  const submit = async () => {
    if (!result || result.code !== code || status === "sending" || !name.trim()) return;
    const abort = new AbortController(); post.current = abort; setStatus("sending");
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch("/api/egg-road-records", {
        method: "POST", credentials: "same-origin", signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, score: result.score, gates: result.gates, distance: result.distance, seconds: result.seconds, finished: result.finished, breakdown: result.breakdown }),
      });
      if (response.status === 429) { if (!abort.signal.aborted) setStatus("limited"); return; }
      if (!response.ok) throw new Error();
      const value = await response.json() as RoadLeaderboard;
      if (!abort.signal.aborted && value.code === code) {
        epoch.current++; setData(value); setFailed(false); setLoading(false); setStatus("saved");
        try { localStorage.setItem("egg_road_name_v1", name.trim()); } catch { /* Optional. */ }
      }
    } catch { if (post.current === abort) setStatus("error"); }
    finally { clearTimeout(timer); }
  };
  return { data: data?.code === code ? data : null, failed, loading, name, status,
    setName: (value: string) => { edited.current = true; setName(value); },
    reload: () => setRevision(value => value + 1), submit };
}

export function RoadRecords({ lang, board, result }: {
  lang: "ru" | "en"; board: ReturnType<typeof useRoadRecords>; result: RoadResult | null;
}) {
  const ui = copy[lang], { data, loading, failed, status } = board;
  return <div className="egg-road-records">
    {result && result.score > 0 && <form className="egg-road-publish" onSubmit={event => { event.preventDefault(); void board.submit(); }}>
      {status === "saved" ? <p role="status">{ui.published}{data?.personal ? ` · #${data.personal.rank}` : ""}</p> : <>
        <label htmlFor="egg-road-name">{ui.playerName}</label>
        <div><input id="egg-road-name" value={board.name} onChange={event => board.setName(event.target.value)} required maxLength={32} autoComplete="nickname" placeholder={ui.namePlaceholder} disabled={status === "sending"} /><button disabled={status === "sending" || !board.name.trim()}>{status === "sending" ? ui.publishing : ui.publish}</button></div>
        <small>{ui.publishNote}</small>
        {(status === "error" || status === "limited") && <p role="alert">{status === "limited" ? ui.publishLimited : ui.publishError}</p>}
      </>}
    </form>}
    <details className="egg-road-help egg-road-leaderboard">
      <summary>{ui.leaderboard}{data ? ` · ${data.total}` : ""}</summary>
      {loading ? <p role="status">{ui.recordsLoading}</p> : failed ? <p role="status">{ui.recordsError} <button type="button" onClick={board.reload}>{ui.tryAgain}</button></p> : data && <>
        {data.entries.length ? <table><thead><tr><th scope="col">#</th><th scope="col">{ui.player}</th><th scope="col">{ui.score}</th></tr></thead><tbody>
          {data.entries.map((entry, i) => <tr key={i} className={entry.mine ? "is-mine" : ""}><td>{entry.rank}</td><th scope="row">{entry.name}{entry.mine && <small> · {ui.you}</small>}</th><td>{entry.score.toLocaleString(lang)}</td></tr>)}
        </tbody></table> : <p>{ui.recordsEmpty}</p>}
        {data.personal && !data.entries.some(entry => entry.mine) && <p>{ui.yourPlace}: #{data.personal.rank} · {data.personal.score.toLocaleString(lang)} {ui.score.toLowerCase()}</p>}
        <p className="egg-road-records-note">{ui.recordsNote}</p>
      </>}
    </details>
  </div>;
}
