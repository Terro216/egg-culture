import { useEffect, useRef, useState } from "react";
import type { RoadResult } from "./simulation.ts";
import type { RoadLeaderboard, RoadAccount } from "./leaderboard.ts";
import { copy } from "./copy.ts";
import { activeRoadAccount } from "./storage.ts";
import { publishRoadRun, roadPublication, watchRoadRecordSync, ROAD_PUBLICATION_EVENT } from "./recordSync.ts";
import type { RoadPublication } from "./recordSync.ts";
import type { SavedRoadRun } from "./results.ts";
import { portalState } from "../Portal/client.ts";

export function useRoadRecords(code: string, saved: SavedRoadRun | null) {
  const result = saved?.result ?? null;
  const [data, setData] = useState<RoadLeaderboard | null>(null);
  const [failed, setFailed] = useState(false), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0), [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "error" | "limited" | "taken" | "account">("idle");
  const epoch = useRef(0);
  const edited = useRef(false);
  useEffect(() => {
    try { const value = localStorage.getItem("egg_road_name_v1"); if (value) setName(value); } catch { /* Optional. */ }
  }, []);
  useEffect(() => {
    let identity = activeRoadAccount();
    const changed = () => {
      const account = portalState().account;
      const current = account?.registered ? account.name.normalize("NFKC").toLowerCase() : null;
      if (current === identity) return;
      identity = current; edited.current = false; epoch.current++;
      setStatus("idle"); setData(null);
      setName(account?.name ?? ""); setRevision(value => value + 1);
    };
    window.addEventListener("egg:portal", changed);
    return () => window.removeEventListener("egg:portal", changed);
  }, []);
  useEffect(() => {
    const abort = new AbortController(); let live = true;
    const requestEpoch = ++epoch.current;
    const timer = setTimeout(() => abort.abort(), 8000);
    setData(null); setFailed(false); setLoading(true);
    void fetch(`/api/egg-road-records?code=${encodeURIComponent(code)}`, { signal: abort.signal, credentials: "same-origin" })
      .then(async response => { if (!response.ok) throw new Error(); return await response.json() as RoadLeaderboard; })
      .then(value => { if (live && epoch.current === requestEpoch && value.code === code) { setData(value); if (!edited.current) setName(previous => value.nameClaimed || !previous ? value.name : previous); } })
      .catch(() => { if (live && epoch.current === requestEpoch) setFailed(true); })
      .finally(() => { clearTimeout(timer); if (live && epoch.current === requestEpoch) setLoading(false); });
    return () => { live = false; clearTimeout(timer); abort.abort(); };
  }, [code, revision]);
  useEffect(() => {
    setStatus(roadPublication(saved).status);
    const changed = (event: Event) => {
      const { run, state } = (event as CustomEvent<{ run: SavedRoadRun; state: RoadPublication }>).detail;
      if (run.owner !== activeRoadAccount() || run.result.code !== code) return;
      if (run.id === saved?.id) setStatus(state.status);
      if (state.data) {
        epoch.current++; setData(state.data); setFailed(false); setLoading(false);
        if (!edited.current) setName(state.data.name);
      }
    };
    window.addEventListener(ROAD_PUBLICATION_EVENT, changed);
    return () => window.removeEventListener(ROAD_PUBLICATION_EVENT, changed);
  }, [saved?.id, code]);
  useEffect(watchRoadRecordSync, []);
  const submit = async () => {
    if (!saved || result?.code !== code || status === "sending") return;
    await publishRoadRun(saved, portalState().account?.registered ? portalState().account!.name : name);
  };
  return { data: data?.code === code ? data : null, failed, loading, name, status,
    registered: portalState().account?.registered ?? data?.registered ?? false,
    setName: (value: string) => { edited.current = true; setName(value); if (status === "taken") setStatus("idle"); },
    adoptAccount: (account: RoadAccount) => {
      epoch.current++; edited.current = false; setData(null); setName(account.name); setStatus("idle");
      try { if (account.registered) localStorage.setItem("egg_road_name_v1", account.name); else localStorage.removeItem("egg_road_name_v1"); } catch { /* Optional. */ }
      setRevision(value => value + 1);
    },
    reload: () => setRevision(value => value + 1), submit };
}

export function RoadRecords({ lang, board, result, best, currentScore, newBest }: {
  lang: "ru" | "en"; board: ReturnType<typeof useRoadRecords>; result: RoadResult | null; best: number; currentScore: number | null; newBest: boolean;
}) {
  const ui = copy[lang], { data, loading, failed, status } = board;
  const record = Math.max(best, data?.personal?.score ?? 0);
  const showPublication = result && result.score > 0 && status !== "saved" && (!board.registered || status !== "idle");
  return <div className="egg-road-records">
    {record > 0 && <p className="egg-road-personal-best">{newBest && currentScore === record ? ui.newBest : ui.trackBest}{currentScore !== record && <>: <strong>{record.toLocaleString(lang)}</strong></>}{data?.personal?.score === record ? ` · #${data.personal.rank}` : ""}</p>}
    {showPublication && <div className="egg-road-publish">
      {status === "sending" ? <p role="status">{ui.publishing}</p> : !board.registered ?
        <form onSubmit={event => { event.preventDefault(); void board.submit(); }}>
          <label htmlFor="egg-road-name">{ui.playerName}</label>
          <div><input id="egg-road-name" value={board.name} onChange={event => board.setName(event.target.value)} required maxLength={32} autoComplete="nickname" placeholder={ui.namePlaceholder} aria-invalid={status === "taken"} aria-describedby={status === "taken" ? "egg-road-name-error" : undefined} /><button disabled={!board.name.trim()}>{ui.publish}</button></div>
          <small>{ui.publishNote}</small>
        </form> : null}
      {status === "taken" && <p id="egg-road-name-error" role="alert">{ui.nameTaken}</p>}
      {status === "account" && <p role="alert">{ui.accountChanged}</p>}
      {(status === "error" || status === "limited") && <p role="status">{status === "limited" ? ui.publishLimited : ui.publishError} <button type="button" onClick={() => void board.submit()}>{ui.tryAgain}</button></p>}
    </div>}
    <details className="egg-road-help egg-road-leaderboard">
      <summary>{ui.leaderboard}{data ? ` · ${data.total}` : ""}</summary>
      {loading ? <p role="status">{ui.recordsLoading}</p> : failed ? <p role="status">{ui.recordsError} <button type="button" onClick={board.reload}>{ui.tryAgain}</button></p> : data && <>
        {data.entries.length ? <table><thead><tr><th scope="col">#</th><th scope="col">{ui.player}</th><th scope="col">{ui.score}</th></tr></thead><tbody>
          {data.entries.map((entry, i) => <tr key={i} className={entry.mine ? "is-mine" : ""}><td>{entry.rank}</td><th scope="row">{entry.profileId ? <a href={`/${lang}/adepts/${entry.profileId}/`}>{entry.name}</a> : entry.name}{entry.mine && <small> · {ui.you}</small>}</th><td>{entry.score.toLocaleString(lang)}</td></tr>)}
        </tbody></table> : <p>{ui.recordsEmpty}</p>}
        {data.personal && !data.entries.some(entry => entry.mine) && <p>{ui.yourPlace}: #{data.personal.rank} · {data.personal.score.toLocaleString(lang)} {ui.score.toLowerCase()}</p>}
        <p className="egg-road-records-note">{ui.recordsNote}</p>
      </>}
    </details>
  </div>;
}
