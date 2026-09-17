import { Component, lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
const EggRoad = lazy(() => import("./EggRoad.tsx"));

class RoadBoundary extends Component<{ children: ReactNode; message: string; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">{this.props.message} <button type="button" onClick={this.props.onClose}>↩</button></p> : this.props.children; }
}

export default function PublicRoad({ lang }: { lang: "ru" | "en" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(true); }, []);
  const loading = lang === "ru" ? "Дорога принимает форму…" : "The road is taking form…";
  return <div className="public-road-launch">
    <button type="button" className="btn" onClick={() => setOpen(true)}>{lang === "ru" ? "Начать спуск" : "Begin the descent"} →</button>
    {open && <RoadBoundary message={lang === "ru" ? "Не удалось открыть игру. Попробуйте ещё раз." : "The game could not open. Please try again."} onClose={() => setOpen(false)}>
      <Suspense fallback={<p role="status">{loading}</p>}><EggRoad lang={lang} publicPage onClose={() => setOpen(false)} /></Suspense>
    </RoadBoundary>}
  </div>;
}
