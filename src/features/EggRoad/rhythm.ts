/** Natural alternating corrections build momentum; flight freezes the whole stroke. */
export class RollRhythm {
  charge = 0;
  chain = 0;
  strokes = 0;
  private direction = 0;
  private duration = 0;
  private rollingDistance = 0;
  private idle = 0;
  private quiet = 0;

  cue(nearRoad: boolean) {
    return {
      state: !nearRoad ? "air" : this.chain ? "flow" : "start",
      progress: this.charge,
    } as const;
  }

  reset() { this.charge = this.chain = this.strokes = this.direction = this.duration = this.rollingDistance = this.idle = this.quiet = 0; }

  step(dt: number, input: number, lateralSpeed: number, forwardSpeed: number, nearRoad: boolean) {
    // Flight pauses the stroke, charge and chain. Inputs in the air earn nothing.
    if (!nearRoad) return false;
    this.quiet += dt;
    if (this.quiet > 2.2) {
      this.quiet -= 1.5;
      this.chain = Math.max(0, this.chain - 1);
      this.charge = Math.max(0, this.charge - 0.16);
    }
    this.charge = Math.max(0, this.charge - dt * 0.025);
    const direction = Math.abs(input) > 0.1 ? Math.sign(input) : 0;
    if (!direction) {
      this.idle += dt;
      if (this.idle > 1.1) this.direction = this.duration = this.rollingDistance = 0;
      return false;
    }
    this.idle = 0;
    let earned = false;
    if (direction !== this.direction) {
      // A small real sideways movement is enough, including braking a drift.
      // There is no deadline, spin requirement or penalty for correcting early.
      if (this.direction && this.duration >= 0.16 && this.rollingDistance >= 0.06 && forwardSpeed > 3) {
        this.chain++;
        this.strokes++;
        this.charge = Math.min(1, this.charge + 0.25);
        this.quiet = 0;
        earned = true;
      }
      this.direction = direction;
      this.duration = this.rollingDistance = 0;
    }
    this.duration += dt;
    if (forwardSpeed > 3) this.rollingDistance += Math.abs(lateralSpeed) * dt;
    return earned;
  }
}
