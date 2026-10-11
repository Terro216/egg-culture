import { Component, lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import PortalPresence from "../Portal/PortalPresence.tsx";
import type { FryLang } from "./rules.ts";
const EggFry = lazy(() => import("./EggFry.tsx"));

class FryBoundary extends Component<{ children: ReactNode; message: string; close: string; onClose(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">{this.props.message} <button type="button" onClick={this.props.onClose}>{this.props.close}</button></p> : this.props.children; }
}

export default function PublicFry({ lang }: { lang: FryLang }) {
  const [open, setOpen] = useState(false), ru = lang === "ru";
  useEffect(() => { setOpen(true); }, []);
  return <div className="public-fry-launch">
    <PortalPresence lang={lang} />
    <button type="button" className="btn public-fry-start" onClick={() => setOpen(true)}>{ru ? "Открыть Жарку" : "Open the Great Fry"} →</button>
    {open && <FryBoundary message={ru ? "Не удалось открыть игру. Попробуйте ещё раз." : "The game could not open. Please try again."} close={ru ? "Назад" : "Back"} onClose={() => setOpen(false)}>
      <Suspense fallback={<p role="status">{ru ? "Сковорода разогревается…" : "Warming up the pan…"}</p>}><EggFry lang={lang} publicPage onClose={() => setOpen(false)} /></Suspense>
    </FryBoundary>}
  </div>;
}
