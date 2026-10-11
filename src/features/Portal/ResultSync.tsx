import { useEffect, useState } from "react";
import { flushPortal, portalState, refreshPortal } from "./client.ts";
import type { PortalState } from "./client.ts";
import { activePortalName } from "./local.ts";

export default function ResultSync({ lang, owner, quiet = false }: { lang: "ru" | "en"; owner: string | null; quiet?: boolean }) {
  const [state, setState] = useState(portalState), ru = lang === "ru";
  useEffect(() => {
    const update = (event: Event) => setState((event as CustomEvent<PortalState>).detail);
    window.addEventListener("egg:portal", update); return () => window.removeEventListener("egg:portal", update);
  }, []);
  if (quiet && (!owner || owner === activePortalName() && (state.syncing || !state.failed && state.unsynced === 0))) return null;
  return <div role="status" style={{ margin: "14px 0", font: "11px/1.6 system-ui, sans-serif", opacity: 0.85 }}>
    {!owner ? <>{ru ? "Результат сохранён в этом браузере. " : "Result saved in this browser. "}<a href={`/${lang}/profile/`}>{ru ? "Войти для следующих забегов →" : "Sign in for future runs →"}</a></>
      : owner !== activePortalName() ? <>{ru ? "Забег остался у начавшего его аккаунта. Для синхронизации войдите в него снова." : "This run belongs to the account that started it. Sign in to that account to sync it."}</>
      : state.failed || state.unsynced > 0 ? <>{state.syncing ? ru ? "Сохраняем в профиль…" : "Saving to your profile…" : <>{ru ? "Результат пока в браузере. " : "Result is still in this browser. "}<button type="button" onClick={() => void (state.failed ? refreshPortal() : flushPortal())}>{ru ? "Повторить отправку" : "Retry sync"}</button></>}</>
      : <>{ru ? "Результат сохранён в профиле." : "Result saved to your profile."}</>}
  </div>;
}
