import { useEffect, useRef, useState } from "react";
import { usePortal } from "../Portal/PortalPresence.tsx";
import { importGuestPortalResult } from "../Portal/client.ts";
import { activePortalName } from "../Portal/local.ts";
import { generatePuzzle } from "./engine.ts";
import { guestNestResults, markGuestNestClaimed } from "./storage.ts";
import type { NestSession } from "./storage.ts";
import "./GuestNestResults.css";

export default function GuestNestResults({ lang }: { lang: "ru" | "en" }) {
  const ru = lang === "ru", portal = usePortal();
  const owner = portal.account?.registered ? portal.account.name.normalize("NFKC").toLowerCase() : null;
  const operation = useRef(0);
  const [results, setResults] = useState<NestSession[]>([]), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { operation.current++; setSaving(false); setMessage(""); }, [owner]);
  useEffect(() => {
    const update = () => setResults(guestNestResults()); update();
    for (const event of ["egg:nest-guest", "egg:portal", "storage", "focus"]) window.addEventListener(event, update);
    return () => { for (const event of ["egg:nest-guest", "egg:portal", "storage", "focus"]) window.removeEventListener(event, update); };
  }, []);
  const claimedElsewhere = portal.resultError === "guest_result_claimed";
  if (!portal.account?.registered || !results.length && !message && !claimedElsewhere) return null;
  return <aside className="nest-guest-import portal-settings" id="nest-results" aria-label={ru ? "Гостевые результаты Халаз судьбы" : "Guest results in Chalazae of Fate"}>
    <h3>{results.length ? ru ? "Сохраните гостевые партии" : "Save your guest games" : ru ? "Гостевые результаты" : "Guest results"}</h3>
    {results.length > 0 && <><p>{ru ? `Завершённых партий в этом браузере: ${results.length}.` : `Completed games in this browser: ${results.length}.`}</p>
      <button className="btn nest-primary" type="button" aria-busy={saving} disabled={saving || portal.failed} onClick={async () => {
        // Consent belongs to the name rendered on this button, even if another
        // tab switches the active account before this click is handled.
        if (!owner) return;
        const revision = ++operation.current;
        setSaving(true); setMessage(""); let imported = 0;
        try {
          for (const s of results) {
            const p = generatePuzzle(s.seed);
            const record = { seed: s.seed, level: p.level, mode: s.mode, ...(s.day ? { day: s.day } : {}), moves: s.moves, hints: s.hints, seconds: s.seconds };
            const ticket = await importGuestPortalResult(s.ticket, { score: String(p.level), peak: String(p.level), seconds: s.seconds, sector: 0, losses: 0, jackpot: false, dodged: 0, swaps: 0, untangle: { ...record, positions: s.points } }, owner);
            if (!ticket) throw Error("not_imported");
            markGuestNestClaimed(s.ticket.id, owner); imported++;
          }
          if (revision === operation.current && activePortalName() === owner) setMessage(ru ? "Результаты переданы на сохранение в профиль. Статус синхронизации — рядом с именем аккаунта." : "Results queued for your profile. Sync status appears beside your account name.");
        } catch {
          if (revision === operation.current && activePortalName() === owner) setMessage(ru ? `Надёжно поставлено на сохранение: ${imported}. Остальные гостевые результаты сохранены для повторной попытки. Проверьте аккаунт и разрешение браузера на хранение данных.` : `${imported} results safely queued. The remaining guest results are retained for another attempt. Check your account and the browser’s storage permission.`);
        } finally { if (revision === operation.current) { setSaving(false); setResults(guestNestResults()); } }
      }}>{saving ? ru ? "Сохраняем…" : "Saving…" : ru ? `Сохранить в профиль «${portal.account.name}»` : `Save to “${portal.account.name}”`}</button>
      <details className="nest-guest-list"><summary>{ru ? "Какие партии сохранятся" : "Games to be saved"}</summary>
        <ul>{results.map(s => { const p = generatePuzzle(s.seed); return <li key={s.ticket.id}>{p.mechanics === "swap" ? ru ? "Хардмод" : "Hard mode" : ru ? "Обычный режим" : "Normal mode"} · {ru ? "уровень" : "level"} {p.level}</li>; })}</ul>
      </details></>}
    {claimedElsewhere ? <p role="alert">{ru ? "Этот гостевой результат уже сохранён в другом профиле. Остальные результаты продолжают синхронизироваться." : "This guest result is already saved in another profile. Other results will continue syncing."}</p> : message && <p role="status">{message}</p>}
  </aside>;
}
