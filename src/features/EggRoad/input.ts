import type { RoadPhase } from "./simulation.ts";

export function acceptsRoadShortcut(event: Pick<KeyboardEvent, "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "target">) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  return !(typeof HTMLElement !== "undefined" && event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab']"));
}
type Actions = { phase: () => RoadPhase; menu: () => boolean; play: () => void; pause: () => void; restart: () => void; center: () => void; skip: () => void; jump: () => void };
export class RoadKeyboard {
  readonly keys = new Set<string>();
  private readonly abort = new AbortController();
  constructor(actions: Actions) {
    window.addEventListener("keydown", event => {
      if (!acceptsRoadShortcut(event)) return;
      const phase = actions.phase(), overview = phase === "overview";
      if (actions.menu()) {
        if (!event.repeat && phase === "paused" && ["Escape", "KeyP"].includes(event.code)) { event.preventDefault(); actions.play(); }
        return;
      }
      if ((phase === "running" || overview) && (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyQ", "KeyE"].includes(event.code) || (overview && ["ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(event.code)))) {
        event.preventDefault(); this.keys.add(event.code); return;
      }
      if (event.repeat) return;
      if (["Escape", "KeyP"].includes(event.code) && ["running", "intro", "overview", "paused"].includes(phase)) {
        event.preventDefault(); if (phase === "paused") actions.play(); else actions.pause();
      } else if (event.code === "KeyR") { event.preventDefault(); actions.restart(); }
      else if (event.code === "KeyC" && phase === "running") { event.preventDefault(); actions.center(); }
      else if (event.code === "Space" && ["ready", "over", "finished", "paused", "intro", "overview", "running"].includes(phase)) {
        event.preventDefault(); if (phase === "intro") actions.skip(); else if (phase === "running") actions.jump(); else actions.play();
      }
    }, { signal: this.abort.signal });
    window.addEventListener("keyup", event => this.keys.delete(event.code), { signal: this.abort.signal });
    window.addEventListener("blur", () => this.clear(), { signal: this.abort.signal });
  }
  clear() { this.keys.clear(); }
  dispose() { this.abort.abort(); this.clear(); }
}
