import { useEffect, useState } from "react";
import { RoadAccount, useRoadAccount } from "../EggRoad/RoadAccount.tsx";
import { usePortal } from "../Portal/PortalPresence.tsx";
import { flushPortal, portalIdentityReady, refreshPortal } from "../Portal/client.ts";
import "./GamesAccount.css";

export default function GamesAccount({ lang }: { lang: "ru" | "en" }) {
  const ru = lang === "ru", state = usePortal();
  const account = useRoadAccount({ data: state.account, reload: () => void refreshPortal(), adoptAccount: () => void refreshPortal() });
  const [open, setOpen] = useState(false);
  const registered = portalIdentityReady(state) && state.account?.registered;
  useEffect(() => {
    // Registration must keep the recovery code visible until it is acknowledged.
    if (registered && !account.recovery && !account.pending) setOpen(false);
  }, [registered, account.recovery, account.pending]);

  return <aside className="games-account" aria-label={ru ? "Сохранение прогресса" : "Save your progress"}>
    {registered ? <a className="btn btn-link games-account-profile" href={`/${lang}/profile/`}>
      {state.account!.name} · {ru ? "Мой прогресс" : "My progress"} →
    </a> : <>
      <button className="btn btn-secondary games-account-open" type="button" aria-expanded={open} aria-controls="games-account-panel" onClick={() => setOpen(value => !value)}>
        {ru ? "Войти, чтобы сохранять прогресс" : "Sign in to save your progress"}
      </button>
      <p className="games-account-note">{ru ? "Один аккаунт для рекордов и достижений во всех играх." : "One account for scores and achievements across all games."}</p>
    </>}
    {state.failed ? <p role="status">{ru ? "Не удалось проверить аккаунт. " : "Could not check your account. "}<button className="btn btn-secondary" type="button" onClick={() => void refreshPortal()}>{ru ? "Повторить" : "Retry"}</button></p>
      : state.syncing ? <p role="status">{ru ? "Сохраняем прогресс…" : "Saving progress…"}</p>
      : state.unsynced > 0 ? <button className="btn btn-secondary" type="button" onClick={() => void flushPortal()}>{ru ? "Сохранить результаты" : "Save results"} ({state.unsynced})</button> : null}
    {(open || account.recovery) && <div id="games-account-panel" className="games-account-panel">
      <RoadAccount lang={lang} account={account} reload={() => void refreshPortal()} failed={state.failed} suggestedName="" openForGuest initialMode="login" />
    </div>}
  </aside>;
}
