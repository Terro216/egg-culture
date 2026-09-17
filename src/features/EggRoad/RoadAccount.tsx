import { useEffect, useRef, useState } from "react";
import type { RoadAccount as Account } from "./leaderboard.ts";
import type { useRoadRecords } from "./RoadRecords.tsx";
import { accountCopy } from "./accountCopy.ts";
import { selectRoadAccount } from "./storage.ts";

type Action = "register" | "login" | "recover" | "change" | "logout";
export function useRoadAccount(board: ReturnType<typeof useRoadRecords>) {
  const [profile, setProfile] = useState<Account | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null), [error, setError] = useState("");
  const [pending, setPending] = useState(false), [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => { if (board.data) setProfile({ name: board.data.name, registered: board.data.registered }); }, [board.data]);
  useEffect(() => () => request.current?.abort(), []);
  const send = async (action: Action, fields: Record<string, string> = {}) => {
    if (request.current) return false;
    const abort = new AbortController(); request.current = abort;
    setPending(true); setError(""); setNotice("");
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch("/api/egg-road-account", { method: "POST", credentials: "same-origin", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...fields }) });
      const value = await response.json() as { account?: Account; recoveryCode?: string; error?: string };
      if (!response.ok || !value.account) { setError(value.error ?? "unavailable"); if (value.error === "already_registered") board.reload(); return false; }
      if (abort.signal.aborted) return false;
      selectRoadAccount(value.account.registered ? value.account.name : null, action === "register");
      setProfile(value.account); setRecovery(value.recoveryCode ?? null);
      setNotice(action === "logout" ? "signedOut" : "success"); board.adoptAccount(value.account);
      return true;
    } catch { if (request.current === abort) setError("unavailable"); return false; }
    finally { clearTimeout(timer); if (request.current === abort) { request.current = null; setPending(false); } }
  };
  return { profile, recovery, error, pending, notice, send, clearRecovery: () => setRecovery(null), clearError: () => { setError(""); setNotice(""); } };
}

export function RoadAccount({ lang, account, reload, failed, suggestedName }: {
  lang: "ru" | "en"; account: ReturnType<typeof useRoadAccount>; reload: () => void; failed: boolean; suggestedName: string;
}) {
  const ui = accountCopy[lang], { profile, pending, recovery } = account;
  const [mode, setMode] = useState<Exclude<Action, "logout">>("register"), [changing, setChanging] = useState(false);
  const [name, setName] = useState(suggestedName), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState(""), [code, setCode] = useState(""), [mismatch, setMismatch] = useState(false), [copyStatus, setCopyStatus] = useState("");
  const nameEdited = useRef(false), recoveryField = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (!nameEdited.current) setName(suggestedName); }, [suggestedName]);
  useEffect(() => { setCopyStatus(""); if (recovery && details.current) details.current.open = true; }, [recovery]);
  const selectMode = (next: typeof mode) => { setMode(next); setPassword(""); setConfirm(""); setCurrent(""); setCode(""); setMismatch(false); account.clearError(); };
  const errors: Record<string, string> = { name_taken: ui.taken, already_registered: ui.already, invalid_name: ui.invalidName, invalid_credentials: ui.credentials, unauthorized: ui.credentials, invalid_recovery: ui.invalidRecovery, password_length: ui.hint, rate_limit: ui.limited, busy: ui.busy };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Path of Form\n${ui.name}: ${profile?.name}\n${ui.recoveryInput}: ${recovery}\n\n${ui.recoveryNote}\n`], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "egg-road-recovery.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details ref={details} className="egg-road-help egg-road-account">
    <summary>{profile?.registered ? `${ui.player}: ${profile.name}` : ui.open}</summary>
    {!profile ? <p role="status">{failed ? ui.unavailable : ui.loading} {failed && <button onClick={reload}>{ui.retry}</button>}</p> : <>
      {recovery ? <section className="egg-road-recovery" aria-label={ui.recoveryTitle}>
        <strong>{ui.recoveryTitle}</strong><p>{ui.recoveryNote}</p>
        <input ref={recoveryField} aria-label={ui.recoveryInput} readOnly value={recovery} onClick={event => event.currentTarget.select()} spellCheck={false} />
        <div className="egg-road-account-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(recovery); setCopyStatus(ui.copied); } catch { recoveryField.current?.select(); setCopyStatus(ui.manual); } }}>{ui.copy}</button><button onClick={download}>{ui.download}</button></div>
        {copyStatus && <p role="status">{copyStatus}</p>}
        <button className="egg-road-account-submit" onClick={account.clearRecovery}>{ui.saved}</button>
      </section> : <>
        {profile.registered ? <>
          <p className="egg-road-account-protected">{ui.protected} · {profile.name}</p>
          <div className="egg-road-account-actions"><button disabled={pending} onClick={() => { selectMode("change"); setChanging(true); }}>{ui.change}</button><button disabled={pending} onClick={() => { void account.send("logout").then(ok => { if (ok) { selectMode("register"); setChanging(false); nameEdited.current = false; } }); }}>{ui.logout}</button></div>
        </> : <>
          <p>{ui.intro}</p>
          <div className="egg-road-account-actions" role="group" aria-label={ui.open}><button disabled={pending} aria-pressed={mode === "register"} onClick={() => selectMode("register")}>{ui.register}</button><button disabled={pending} aria-pressed={mode === "login"} onClick={() => selectMode("login")}>{ui.login}</button></div>
        </>}
        {(!profile.registered || changing) && <form className="egg-road-account-form" onSubmit={event => {
          event.preventDefault();
          if (mode !== "login" && password !== confirm) { setMismatch(true); return; }
          setMismatch(false);
          void account.send(profile.registered ? "change" : mode, { name, password, currentPassword: current, recoveryCode: code }).then(ok => { if (ok) { setPassword(""); setConfirm(""); setCurrent(""); setCode(""); setChanging(false); } });
        }}>
          {mode === "register" && <p>{ui.existing}</p>}
          {mode === "recover" && <p>{ui.recoveryIntro}</p>}
          {profile.registered ? <><p>{ui.changeNote}</p><label htmlFor="road-account-current">{ui.current}</label><input id="road-account-current" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={256} disabled={pending} /></> : <><label htmlFor="road-account-name">{ui.name}</label><input id="road-account-name" autoComplete="username" value={name} onChange={event => { nameEdited.current = true; setName(event.target.value); }} required maxLength={32} disabled={pending} autoCapitalize="none" spellCheck={false} /></>}
          {mode === "recover" && <><label htmlFor="road-account-recovery">{ui.recoveryInput}</label><input id="road-account-recovery" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} required maxLength={80} disabled={pending} /></>}
          <label htmlFor="road-account-password">{mode === "recover" || mode === "change" ? ui.newPassword : ui.password}</label><input id="road-account-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={15} maxLength={256} disabled={pending} aria-describedby={mode === "login" ? undefined : "road-password-hint"} />
          {mode !== "login" && <><small id="road-password-hint">{ui.hint}</small><label htmlFor="road-account-confirm">{ui.confirm}</label><input id="road-account-confirm" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required minLength={15} maxLength={256} disabled={pending} /></>}
          {mismatch && <p role="alert">{ui.mismatch}</p>}
          <button className="egg-road-account-submit" disabled={pending}>{pending ? ui.saving : ui[mode]}</button>
          {changing && <button type="button" disabled={pending} onClick={() => { setChanging(false); selectMode("register"); }}>{ui.cancel}</button>}
          {!profile.registered && mode !== "recover" && <button type="button" disabled={pending} onClick={() => selectMode("recover")}>{ui.forgot}</button>}
        </form>}
      </>}
      {account.error && <p role="alert">{errors[account.error] ?? ui.unavailable}</p>}
      {account.notice && !recovery && <p role="status">{account.notice === "signedOut" ? ui.signedOut : ui.success}</p>}
    </>}
  </details>;
}
