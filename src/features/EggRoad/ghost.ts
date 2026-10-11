import { Quaternion, Vector3 } from "three";
import type { RoadResult } from "./simulation.ts";

type GhostTape = { schema: 1; code: string; score: number; created: number; frames: number[][] };
const prefix = "egg_road_ghost_v1:";
const storageKey = (code: string, owner: string | null) => `${prefix}${encodeURIComponent(owner ?? "")}:${code}`;
export function validGhost(value: unknown, code: string): value is GhostTape {
  const tape = value as GhostTape | null;
  return tape?.schema === 1 && tape.code === code && Number.isSafeInteger(tape.score) && tape.score >= 0 &&
    Array.isArray(tape.frames) && tape.frames.length >= 2 && tape.frames.length <= 6000 &&
    tape.frames.every((frame, i) => Array.isArray(frame) && frame.length === 8 && frame.every(Number.isFinite) &&
      frame[0] >= 0 && (i === 0 ? frame[0] < .2 : frame[0] > tape.frames[i - 1][0]));
}

/** A local visual replay, never an input to simulation, scoring or record validation. */
export class RoadGhost {
  enabled = false;
  private code = "";
  private owner: string | null = null;
  private frames: number[][] = [];
  private previous: GhostTape | null = null;
  private cursor = 0;
  private nextSample = 0;
  private readonly origin = new Vector3();
  private readonly rotation = new Quaternion();
  begin(code: string, owner: string | null) {
    this.code = code; this.owner = owner; this.frames = []; this.previous = null;
    this.cursor = this.nextSample = 0; this.origin.set(0, 0, 0);
    if (!this.enabled) return;
    try { const tape = JSON.parse(localStorage.getItem(storageKey(code, owner)) ?? "null"); if (validGhost(tape, code)) this.previous = tape; } catch { /* Optional local replay. */ }
  }
  sample(seconds: number, position: Vector3, rotation: Quaternion, shift: Vector3) {
    this.origin.add(shift);
    if (!this.enabled || seconds < this.nextSample || this.frames.length >= 6000) return;
    this.nextSample = seconds + .1;
    this.frames.push([seconds, position.x + this.origin.x, position.y + this.origin.y, position.z + this.origin.z, ...rotation.toArray()]);
  }
  pose(seconds: number, position: Vector3, rotation: Quaternion) {
    const frames = this.previous?.frames;
    if (!this.enabled || !frames || seconds < frames[0][0] || seconds > frames.at(-1)![0]) return false;
    while (this.cursor < frames.length - 2 && frames[this.cursor + 1][0] < seconds) this.cursor++;
    const a = frames[this.cursor], b = frames[this.cursor + 1], t = Math.min(1, Math.max(0, (seconds - a[0]) / (b[0] - a[0])));
    position.set(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t).sub(this.origin);
    rotation.fromArray(a, 4).slerp(this.rotation.fromArray(b, 4), t);
    return true;
  }
  finish(result: RoadResult) {
    if (!this.enabled || this.frames.length < 2 || this.frames[0][0] >= .2 || result.score <= (this.previous?.score ?? -1)) return;
    const tape: GhostTape = { schema: 1, code: this.code, score: result.score, created: Date.now(), frames: this.frames };
    try {
      // Cap replay storage independently of complete result history.
      const keys: { key: string; created: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          try { keys.push({ key, created: Number(JSON.parse(localStorage.getItem(key)!).created) || 0 }); } catch { /* Ignore damaged unrelated tapes. */ }
        }
      }
      const key = storageKey(this.code, this.owner);
      for (const old of keys.filter(item => item.key !== key).sort((a, b) => b.created - a.created).slice(2)) localStorage.removeItem(old.key);
      localStorage.setItem(key, JSON.stringify(tape));
    } catch { /* A replay is optional; the separate result is already saved. */ }
  }
}
