export type TrialVector = { x: number; y: number };
export const CHALAZA_CENTER_RADIUS = 0.32;
export const CHALAZA_FRAME_LIMIT = 1.08;
export const CHALAZA_HOLD_MS = 5200;
const STEP_MS = 1000 / 60;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** The drift, damping and score all share one clock, independent of rendering. */
export class ChalazaSimulation {
  x = 0;
  y = 0;
  vx = 0.006;
  vy = -0.003;
  holdMs = 0;
  elapsedMs = 0;
  completed = false;
  rolledAway = false;
  private remainder = 0;
  private lastCorrection = -Infinity;

  get centered() { return Math.hypot(this.x, this.y) < CHALAZA_CENTER_RADIUS; }
  get correcting() { return this.elapsedMs - this.lastCorrection <= 1200; }

  advance(elapsedMs: number, control: TrialVector, manual: boolean) {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || this.completed || this.rolledAway) return;
    // A suspended page must not catch up a whole hidden run on return. Any time
    // discarded here is also discarded by the drift and hold clocks.
    this.remainder += Math.min(250, elapsedMs);
    const x = Number.isFinite(control.x) ? clamp(control.x, -1, 1) : 0;
    const y = Number.isFinite(control.y) ? clamp(control.y, -1, 1) : 0;
    while (this.remainder + 1e-8 >= STEP_MS && !this.completed && !this.rolledAway) {
      this.remainder -= STEP_MS;
      this.elapsedMs += STEP_MS;
      const t = this.elapsedMs / 1000;
      const driftX = Math.sin(t * 0.9) * 0.13 + Math.cos(t * 0.37) * 0.08 + Math.sin(t * 2.25) * 0.055;
      const driftY = Math.cos(t * 0.72) * 0.12 + Math.sin(t * 1.85) * 0.045;
      if (manual) {
        this.vx += (x * 0.04 + driftX * 0.04 - this.vx) * 0.32;
        this.vy += (y * 0.04 + driftY * 0.04 - this.vy) * 0.32;
      } else {
        this.vx = (this.vx + (driftX + x * 0.56) * STEP_MS / 1000) * 0.91;
        this.vy = (this.vy + (driftY + y * 0.56) * STEP_MS / 1000) * 0.91;
      }
      this.x = clamp(this.x + this.vx * STEP_MS / 20.6, -CHALAZA_FRAME_LIMIT, CHALAZA_FRAME_LIMIT);
      this.y = clamp(this.y + this.vy * STEP_MS / 20.6, -CHALAZA_FRAME_LIMIT, CHALAZA_FRAME_LIMIT);
      // Sensor noise and a single old tap must not turn periodic drift into an
      // unattended win. Small deliberate corrections keep the hold active.
      if (Math.hypot(x, y) >= 0.035) this.lastCorrection = this.elapsedMs;
      this.holdMs = this.centered && this.correcting ? this.holdMs + STEP_MS : Math.max(0, this.holdMs - STEP_MS * 0.8);
      this.rolledAway = Math.abs(this.x) >= CHALAZA_FRAME_LIMIT || Math.abs(this.y) >= CHALAZA_FRAME_LIMIT;
      this.completed = !this.rolledAway && this.holdMs + 1e-7 >= CHALAZA_HOLD_MS;
    }
  }
}
