/** A stroke only earns momentum after the egg has actually rolled sideways. */
export class RollRhythm {
  charge = 0;
  chain = 0;
  private direction = 0;
  private duration = 0;
  private rollingDistance = 0;
  private idle = 0;

  reset() { this.charge = this.chain = this.direction = this.duration = this.rollingDistance = this.idle = 0; }

  step(dt: number, input: number, lateralSpeed: number, rollRate: number, nearRoad: boolean) {
    this.charge = Math.max(0, this.charge - dt * (nearRoad ? 0.07 : 0.35));
    const direction = Math.abs(input) > 0.3 ? Math.sign(input) : 0;
    if (!direction || !nearRoad) {
      this.idle += dt;
      if (this.idle > 0.22) { this.direction = this.duration = this.rollingDistance = this.chain = 0; }
      return;
    }
    this.idle = 0;
    if (direction !== this.direction) {
      const inTime = this.duration >= 0.28 && this.duration <= 0.95;
      if (this.direction && inTime && this.rollingDistance > 0.28) {
        this.chain++;
        this.charge = Math.min(1, this.charge + 0.22);
      } else if (this.direction) {
        this.chain = 0;
        this.charge = Math.max(0, this.charge - 0.12);
      }
      this.direction = direction;
      this.duration = this.rollingDistance = 0;
    }
    this.duration += dt;
    if (direction * lateralSpeed > 0.3 && Math.abs(rollRate) > 0.5) this.rollingDistance += Math.abs(lateralSpeed) * dt;
    if (this.duration > 1.2) this.chain = 0;
  }
}
