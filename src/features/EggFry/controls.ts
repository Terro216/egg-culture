import { clampSteering, STEERING_LIMIT } from "./rules.ts";
import { acceptsGameKey } from "../../shared/game/keyboard.ts";

export function fryKeyAction(event: Pick<KeyboardEvent, "code" | "repeat" | "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "target">) {
  if (!acceptsGameKey(event)) return null;
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) return "steer";
  if (event.code === "ArrowDown" || event.code === "KeyS") return "center";
  if (event.repeat) return null;
  if (event.code === "KeyE") return "cancel";
  if (event.code === "KeyF") return "brake";
  if (event.code === "KeyP") return "pause";
  return null;
}

export class FrySteering {
  private pointer: { id: number; x: number; lastX: number; target: number; width: number } | null = null;
  inverted = false;
  target = 0;
  begin(id: number, x: number, width: number) {
    if (this.pointer || !Number.isFinite(x) || width <= 0) return;
    this.pointer = { id, x, lastX: x, width, target: this.target };
  }
  move(id: number, x: number) {
    if (!this.pointer || this.pointer.id !== id) return;
    if (!Number.isFinite(x)) return;
    this.pointer.lastX = x;
    this.target = clampSteering(this.pointer.target + (x - this.pointer.x) / (this.pointer.width * 0.65) * STEERING_LIMIT * 2 * (this.inverted ? -1 : 1));
  }
  end(id: number) { if (this.pointer?.id === id) this.pointer = null; }
  release() { this.pointer = null; }
  reanchor(value: number) {
    this.target = clampSteering(value);
    if (this.pointer) { this.pointer.x = this.pointer.lastX; this.pointer.target = this.target; }
  }
  setInverted(value: boolean) {
    if (this.inverted === value) return;
    this.inverted = value;
    this.reanchor(this.target);
  }
  reset() { this.release(); this.target = 0; this.inverted = false; }
  keyboard(direction: number, dt: number) { if (direction) this.target = clampSteering(this.target + direction * dt * 9 * (this.inverted ? -1 : 1)); }
}
