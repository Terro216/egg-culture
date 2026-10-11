import { useEffect, useState } from "react";
import { flushPortal, portalState, refreshPortal } from "./client.ts";
import type { PortalState } from "./client.ts";

let observers = 0;
const refresh = () => { void refreshPortal(); };
const storage = (event: StorageEvent) => { if (event.key === "egg_road_active_account_v1") refresh(); };
const visible = () => { if (!document.hidden) refresh(); };

export function usePortal() {
  // A lazy island may hydrate after another island has already fetched the account.
  // Its first render must still match the anonymous server snapshot.
  const [value, setValue] = useState<PortalState>({ account: null, profile: null, failed: false, syncing: false, unsynced: 0 });
  useEffect(() => {
    const update = (event: Event) => setValue((event as CustomEvent<PortalState>).detail);
    window.addEventListener("egg:portal", update); setValue(portalState());
    if (++observers === 1) {
      window.addEventListener("egg:account", refresh); window.addEventListener("storage", storage);
      window.addEventListener("online", refresh); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible); refresh();
    }
    return () => {
      window.removeEventListener("egg:portal", update);
      if (--observers === 0) {
        window.removeEventListener("egg:account", refresh); window.removeEventListener("storage", storage);
        window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible);
      }
    };
  }, []);
  return value;
}
export default function PortalPresence({ lang }: { lang: "ru" | "en" }) {
  const value = usePortal(), ru = lang === "ru";
  return <aside className="portal-presence" style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", justifyContent: "center", margin: "12px 0 25px", font: "13px/1.5 system-ui, sans-serif" }}>
    <a href={`/${lang}/profile/`}>{value.account?.registered ? `${value.account.name} · ${ru ? "Профиль" : "Profile"}` : ru ? "Один аккаунт для всего Egg Culture →" : "One account for all of Egg Culture →"}</a>
    {value.failed ? <button onClick={() => void refreshPortal()}>{ru ? "Повторить синхронизацию" : "Retry sync"}</button>
      : value.syncing ? <span role="status">{ru ? "Сохраняем результат…" : "Saving result…"}</span>
      : value.unsynced > 0 ? <button onClick={() => void flushPortal()}>{ru ? `Отправить результаты (${value.unsynced})` : `Sync results (${value.unsynced})`}</button> : null}
  </aside>;
}
